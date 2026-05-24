import type { GeminiRequest, GeminiResponse, GeminiResult, InventoryItem } from "./types.ts";
import { formatTotalRemaining } from "./inventory.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 5000;

const SYSTEM_PROMPT = `あなたは家庭の在庫管理アシスタントです。
ユーザーの問いかけに対して、以下の在庫リストから最適なアイテムを見つけ、
簡潔な日本語で回答を生成してください。

ルール:
- アイテムが見つかり在庫がある場合: stockStatus = "in_stock"
- アイテムが見つかったが units=0 かつ opened_remaining が null の場合: stockStatus = "out_of_stock", speech に「〇〇は在庫切れです」
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

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
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
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      console.error("[gemini] API error:", res.status, errText);
      return { kind: "error" };
    }

    const json = (await res.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[gemini] Empty response");
      return { kind: "error" };
    }

    return { kind: "ok", data: JSON.parse(text) };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[gemini] Timeout after", GEMINI_TIMEOUT_MS, "ms");
      return { kind: "timeout" };
    }
    console.error("[gemini] Fetch error:", err);
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
