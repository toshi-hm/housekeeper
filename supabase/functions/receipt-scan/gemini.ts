import { normalizeLineItem, isValidReceiptScanResult } from "./validation.ts";
import type {
  GeminiReceiptResult,
  GeminiRequest,
  GeminiResponse,
  ReceiptMimeType,
  ReceiptScanResponse,
} from "./types.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
// Image analysis takes longer than inventory-chat's text-only calls
// (receipt-scan.md §3.1: 20s there vs 25s here).
const GEMINI_TIMEOUT_MS = 25000;

const SYSTEM_PROMPT = `あなたはレシート画像から購入品目を抽出するアシスタントです。
画像に写っているレシートを読み取り、購入した商品ごとに1行のデータを作成してください。

ルール:
- 小計・合計・消費税・お預り・お釣り・ポイント表記・割引行など、商品そのものではない行は含めないこと。
- 商品名(name)はレシートに記載された表記のまま省略せず書き出す。
- 個数(quantity)が読み取れない場合は1とする。
- 単価(unitPrice)は1点あたりの価格(円、整数)。割引後価格が不明瞭、またはレシートに
  記載がない場合はnullにする。
- confidenceは、商品名・価格の読み取りに自信がある場合は"high"、文字が不鮮明・レシートの
  一部が欠けている等で自信が無い場合は"low"にする。
- レシートが読み取れない、または商品行が1つも無い場合は items を空配列にする。
- 必ず指定のJSONスキーマで返し、それ以外のテキストは含めないこと。`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number", nullable: true },
          confidence: { type: "string", enum: ["high", "low"] },
        },
        required: ["name", "quantity", "unitPrice", "confidence"],
      },
    },
  },
  required: ["items"],
};

export const buildGeminiRequestBody = (
  image: string,
  mimeType: ReceiptMimeType,
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
    // #696: lower than inventory-chat's 0.2 — this is an extraction task
    // where consistency matters more than conversational variety.
    temperature: 0.1,
  },
});

export const queryGeminiReceiptScan = async (
  image: string,
  mimeType: ReceiptMimeType,
): Promise<GeminiReceiptResult> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[receipt-scan] GEMINI_API_KEY is not configured");
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
      console.error("[receipt-scan] Gemini timeout after", GEMINI_TIMEOUT_MS, "ms");
      return { kind: "timeout" };
    }
    console.error("[receipt-scan] Gemini fetch error:", e);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    if (!res.ok) {
      const errText = await res.text();
      console.error("[receipt-scan] Gemini API error:", res.status, errText);
      return { kind: "error" };
    }

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => !p.thought)?.text;
    if (!text) {
      console.error("[receipt-scan] Empty response from Gemini");
      return { kind: "error" };
    }

    const parsed: unknown = JSON.parse(text);
    if (!isValidReceiptScanResult(parsed)) {
      console.error(
        "[receipt-scan] Response schema mismatch:",
        JSON.stringify(parsed).slice(0, 200),
      );
      return { kind: "error" };
    }

    const response: ReceiptScanResponse = { items: parsed.items.map(normalizeLineItem) };
    console.log("[receipt-scan] Gemini success:", GEMINI_MODEL, "items:", response.items.length);
    return { kind: "ok", data: response };
  } catch (err) {
    console.error("[receipt-scan] Gemini parse error:", err);
    return { kind: "error" };
  }
};
