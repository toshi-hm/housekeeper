import type {
  GeminiMatchResult,
  GeminiRequest,
  GeminiResponse,
  GeminiResult,
  InventoryItem,
} from "./types.ts";
import { formatTotalRemaining } from "./inventory.ts";

const CONFIDENCE_VALUES = new Set(["exact", "fuzzy", "none"]);
const STOCK_STATUS_VALUES = new Set(["in_stock", "out_of_stock", "not_found"]);

const isValidMatchedItem = (item: unknown): boolean => {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  return (
    typeof it.id === "string" &&
    typeof it.name === "string" &&
    typeof it.units === "number" &&
    isFinite(it.units) &&
    typeof it.content_amount === "number" &&
    isFinite(it.content_amount) &&
    typeof it.content_unit === "string"
  );
};

const isValidGeminiResult = (data: unknown): data is GeminiMatchResult => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    Array.isArray(d.matchedItems) &&
    d.matchedItems.every(isValidMatchedItem) &&
    typeof d.speech === "string" &&
    CONFIDENCE_VALUES.has(d.confidence as string) &&
    STOCK_STATUS_VALUES.has(d.stockStatus as string)
  );
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 7000;

const SYSTEM_PROMPT = `あなたは家庭の在庫管理アシスタントです。
ユーザーの問いかけに対して、以下の在庫リストから最適なアイテムを見つけ、
簡潔な日本語で回答を生成してください。

ルール:
- アイテムが見つかり total_remaining が「0{単位}」でない場合: stockStatus = "in_stock"
- アイテムが見つかったが total_remaining が「0{単位}」の場合: stockStatus = "out_of_stock", speech に「〇〇は在庫切れです」
- アイテムが在庫リストに一切見つからない場合: stockStatus = "not_found", speech に「今までの購入記録から〇〇は見つかりませんでした」
- 複数ヒット(3件以下): すべて列挙して読み上げる
- 複数ヒット(4件以上): 「〇〇など△件あります」と要約する
- 類似品がある場合(confidence="fuzzy"): そのまま回答する
- 必ず指定のJSONスキーマで返すこと。それ以外のテキストは含めないこと。`;

const buildInventoryContext = (items: InventoryItem[]): string => {
  const list = items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.categories?.name ?? null,
    storage_location: item.storage_locations?.name ?? null,
    units: item.units,
    content_amount: item.content_amount,
    content_unit: item.content_unit,
    opened_remaining: item.opened_remaining,
    expiry_date: item.expiry_date,
    total_remaining: formatTotalRemaining(item),
  }));
  return JSON.stringify(list);
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    matchedItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          units: { type: "number" },
          content_amount: { type: "number" },
          content_unit: { type: "string" },
          opened_remaining: { type: "number", nullable: true },
          expiry_date: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          storage_location: { type: "string", nullable: true },
        },
        required: ["id", "name", "units", "content_amount", "content_unit"],
      },
    },
    speech: { type: "string" },
    confidence: { type: "string", enum: ["exact", "fuzzy", "none"] },
    stockStatus: {
      type: "string",
      enum: ["in_stock", "out_of_stock", "not_found"],
    },
  },
  required: ["matchedItems", "speech", "confidence", "stockStatus"],
};

export const queryGemini = async (
  userMessage: string,
  items: InventoryItem[],
): Promise<GeminiResult> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[gemini] GEMINI_API_KEY is not configured");
    return { kind: "error" };
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const inventoryContext = buildInventoryContext(items);

  const body: GeminiRequest = {
    systemInstruction: {
      parts: [
        {
          text: `${SYSTEM_PROMPT}\n\n在庫リスト:\n${inventoryContext}`,
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), GEMINI_TIMEOUT_MS),
  );
  const fetchPromise = fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  let res: Response;
  try {
    res = await Promise.race([fetchPromise, timeoutPromise]);
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      console.error("[gemini] Timeout after", GEMINI_TIMEOUT_MS, "ms");
      return { kind: "timeout" };
    }
    console.error("[gemini] Fetch error:", e);
    return { kind: "error" };
  }

  try {
    if (!res.ok) {
      const errText = await res.text();
      console.error("[gemini] API error:", res.status, errText);
      return { kind: "error" };
    }

    const json = (await res.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[gemini] Empty response from Gemini");
      return { kind: "error" };
    }

    const parsed: unknown = JSON.parse(text);
    if (!isValidGeminiResult(parsed)) {
      console.error("[gemini] Response schema mismatch:", JSON.stringify(parsed).slice(0, 200));
      return { kind: "error" };
    }
    console.log("[gemini] Success:", GEMINI_MODEL, "stockStatus:", parsed.stockStatus);
    return { kind: "ok", data: parsed };
  } catch (err) {
    console.error("[gemini] Response parse error:", err);
    return { kind: "error" };
  }
};

// Intent-specific prompt builders
export const buildCheckInventoryPrompt = (query: string): string =>
  `「${query}」に関連する在庫アイテムを見つけて、在庫数を教えてください。`;

export const buildCheckExpiryPrompt = (query: string): string =>
  `「${query}」に関連する在庫アイテムを見つけて、賞味期限を教えてください。expiry_dateフィールドを使用してください。`;

export const buildListByLocationPrompt = (location: string): string =>
  `保管場所「${location}」にあるすべてのアイテムを列挙してください。storage_locationフィールドで絞り込んでください。`;

export const buildCheckLocationPrompt = (query: string): string =>
  `「${query}」に関連する在庫アイテムを見つけて、保管場所を教えてください。storage_locationフィールドを使用してください。`;

export const buildCheckRemainingPrompt = (query: string): string =>
  `「${query}」に関連する在庫アイテムを見つけて、残量を教えてください。total_remainingフィールドを使用してください。`;

export const buildAddToShoppingListPrompt = (query: string): string =>
  `「${query}」に最も近い在庫アイテムを見つけてください。在庫確認のために使用します。`;
