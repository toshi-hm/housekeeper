import { isValidShelfScanResult, normalizeShelfScanItems } from "./validation.ts";
import type {
  GeminiRequest,
  GeminiResponse,
  GeminiShelfScanResult,
  ShelfScanMimeType,
  ShelfScanResponse,
} from "./types.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
// receipt-scanと同じ画像解析タイムアウト（receipt-scan/gemini.ts参照、
// shelf-scan.md §3.1に相当する記載はないが同一のVision呼び出しパターンを踏襲する）。
const GEMINI_TIMEOUT_MS = 25000;

const SYSTEM_PROMPT = `あなたは棚や冷蔵庫の写真から、写っている商品を認識するアシスタントです。
画像に写っている商品ごとに、商品名を1つずつ書き出してください。

ルール:
- 個数・内容量・価格は読み取らないこと（商品名だけを返す。shelf-scanでは数量は
  推定しない）。
- 同じ商品が複数写っていても、商品名としては1件にまとめる（重複させない）。
- 商品名はパッケージの表記から読み取れる範囲で具体的に書く（例: 「牛乳」ではなく
  「明治おいしい牛乳」のように読み取れた場合はそのまま書く。ブランド名が読み取れ
  なければ一般名詞（「牛乳」等）でよい）。
- 写真がぼやけている、または商品が1つも写っていない場合は items を空配列にする。
- 必ず指定のJSONスキーマで返し、それ以外のテキストは含めないこと。`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["items"],
};

export const buildGeminiRequestBody = (
  image: string,
  mimeType: ShelfScanMimeType,
): GeminiRequest => ({
  contents: [
    {
      role: "user",
      parts: [{ text: SYSTEM_PROMPT }, { inlineData: { mimeType, data: image } }],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    // receipt-scanと同じ低温度設定（抽出タスクは一貫性優先、#696参照）。
    temperature: 0.1,
  },
});

export const queryGeminiShelfScan = async (
  image: string,
  mimeType: ShelfScanMimeType,
): Promise<GeminiShelfScanResult> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[shelf-scan] GEMINI_API_KEY is not configured");
    return { kind: "error" };
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = buildGeminiRequestBody(image, mimeType);

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
      console.error("[shelf-scan] Gemini timeout after", GEMINI_TIMEOUT_MS, "ms");
      return { kind: "timeout" };
    }
    console.error("[shelf-scan] Gemini fetch error:", e);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    if (!res.ok) {
      const errText = await res.text();
      console.error("[shelf-scan] Gemini API error:", res.status, errText);
      return { kind: "error" };
    }

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => !p.thought)?.text;
    if (!text) {
      console.error("[shelf-scan] Empty response from Gemini");
      return { kind: "error" };
    }

    const parsed: unknown = JSON.parse(text);
    if (!isValidShelfScanResult(parsed)) {
      console.error("[shelf-scan] Response schema mismatch:", JSON.stringify(parsed).slice(0, 200));
      return { kind: "error" };
    }

    const response: ShelfScanResponse = { items: normalizeShelfScanItems(parsed.items) };
    console.log("[shelf-scan] Gemini success:", GEMINI_MODEL, "items:", response.items.length);
    return { kind: "ok", data: response };
  } catch (err) {
    console.error("[shelf-scan] Gemini parse error:", err);
    return { kind: "error" };
  }
};
