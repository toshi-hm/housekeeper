import type {
  ChatHistoryTurn,
  ChatMatchedItem,
  GeminiChatResult,
  GeminiContent,
  GeminiRequest,
  GeminiResponse,
  GeminiResult,
  InventoryItem,
  RecentlyConsumedItem,
} from "./types.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
// The web client has no hard latency cap like Alexa's 8s, so allow more headroom.
const GEMINI_TIMEOUT_MS = 20000;
// Cap history to keep token usage within the free tier.
const MAX_HISTORY_TURNS = 8;

// Total remaining amount as a human-readable string (e.g. "1.5L", "3個").
const formatTotalRemaining = (item: InventoryItem): string => {
  const { units, content_amount, content_unit, opened_remaining } = item;
  if (units === 0 && opened_remaining === null) return `0${content_unit}`;
  const closedUnits = opened_remaining !== null ? Math.max(units - 1, 0) : units;
  const total = closedUnits * content_amount + (opened_remaining ?? 0);
  const rounded = Number.isInteger(total) ? total : Math.round(total * 100) / 100;
  return `${rounded}${content_unit}`;
};

const isValidMatchedItem = (item: unknown): item is ChatMatchedItem => {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  return typeof it.id === "string" && typeof it.name === "string";
};

export const isValidGeminiChatResult = (data: unknown): data is GeminiChatResult => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.reply === "string" && Array.isArray(d.items) && d.items.every(isValidMatchedItem);
};

export const buildInventoryContext = (
  items: InventoryItem[],
  recentlyConsumed: RecentlyConsumedItem[],
): string => {
  const inventoryList = items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.categories?.name ?? null,
    storage_location: item.storage_locations?.name ?? null,
    total_remaining: formatTotalRemaining(item),
    expiry_date: item.expiry_date,
  }));
  const consumedList = recentlyConsumed.map((c) => ({
    item_id: c.item_id,
    item_name: c.item_name,
    last_consumed_at: c.last_consumed_at,
  }));
  return JSON.stringify({ inventory: inventoryList, recently_consumed: consumedList });
};

const SYSTEM_PROMPT = `あなたは家庭の在庫管理アシスタントです。
ユーザーとチャット形式で会話し、提供された在庫データに基づいて在庫・賞味期限・保管場所・残量などの質問に答えます。

ルール:
- 回答(reply)は日本語の自然な会話文で、簡潔に。マークダウンの見出しや表は使わず、必要なら箇条書き程度に留める。
- 在庫データ(inventory)に該当アイテムがあれば、残量(total_remaining)・賞味期限(expiry_date)・保管場所(storage_location)を踏まえて答える。
- 該当アイテムが在庫になく recently_consumed にあれば「最近使い切った」旨を伝える。
- どちらにもなければ「自宅にありません」と伝える。
- 商品名は部分一致・類似語も許容する（例:「牛乳」は「低脂肪牛乳」にもマッチ）。
- 在庫管理に無関係な質問には、在庫アシスタントである旨を伝えて丁寧にお断りする。
- items には回答に関連した在庫アイテム(idは在庫データのidをそのまま使う)のみを入れる。該当なしなら空配列。
- 必ず指定のJSONスキーマで返し、それ以外のテキストは含めないこと。`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          total_remaining: { type: "string" },
          expiry_date: { type: "string", nullable: true },
          storage_location: { type: "string", nullable: true },
        },
        required: ["id", "name"],
      },
    },
  },
  required: ["reply", "items"],
};

// Build the Gemini `contents` array from prior history plus the new message.
export const buildContents = (message: string, history: ChatHistoryTurn[]): GeminiContent[] => {
  const trimmed = history.slice(-MAX_HISTORY_TURNS).map(
    (turn): GeminiContent => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }),
  );
  return [...trimmed, { role: "user", parts: [{ text: message }] }];
};

// Build the Gemini `generateContent` request body. Exported so tests can pin the
// generationConfig without mocking network calls (see chat.test.ts).
export const buildGeminiRequestBody = (
  message: string,
  history: ChatHistoryTurn[],
  items: InventoryItem[],
  recentlyConsumed: RecentlyConsumedItem[],
): GeminiRequest => {
  const inventoryContext = buildInventoryContext(items, recentlyConsumed);
  return {
    systemInstruction: {
      parts: [
        {
          text: `${SYSTEM_PROMPT}\n\n在庫データ(inventory=現在の在庫, recently_consumed=過去2か月以内に使い切ったアイテム):\n${inventoryContext}`,
        },
      ],
    },
    contents: buildContents(message, history),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      // gemini-2.5-flash uses thinkingBudget, not thinkingLevel (Gemini 3.x only).
      thinkingConfig: { thinkingBudget: 1024 },
    },
  };
};

export const queryGeminiChat = async (
  message: string,
  history: ChatHistoryTurn[],
  items: InventoryItem[],
  recentlyConsumed: RecentlyConsumedItem[],
): Promise<GeminiResult> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[inventory-chat] GEMINI_API_KEY is not configured");
    return { kind: "error" };
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = buildGeminiRequestBody(message, history, items, recentlyConsumed);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      console.error("[inventory-chat] Gemini timeout after", GEMINI_TIMEOUT_MS, "ms");
      return { kind: "timeout" };
    }
    console.error("[inventory-chat] Gemini fetch error:", e);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    if (!res.ok) {
      const errText = await res.text();
      console.error("[inventory-chat] Gemini API error:", res.status, errText);
      return { kind: "error" };
    }

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => !p.thought)?.text;
    if (!text) {
      console.error("[inventory-chat] Empty response from Gemini");
      return { kind: "error" };
    }

    const parsed: unknown = JSON.parse(text);
    if (!isValidGeminiChatResult(parsed)) {
      console.error(
        "[inventory-chat] Response schema mismatch:",
        JSON.stringify(parsed).slice(0, 200),
      );
      return { kind: "error" };
    }
    console.log("[inventory-chat] Gemini success:", GEMINI_MODEL, "items:", parsed.items.length);
    return { kind: "ok", data: parsed };
  } catch (err) {
    console.error("[inventory-chat] Gemini parse error:", err);
    return { kind: "error" };
  }
};
