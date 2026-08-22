export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

export interface ReceiptScanRequest {
  /** 生base64（先頭の data:...;base64, は除去済みの前提） */
  image: string;
  mimeType: ReceiptMimeType;
}

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  confidence: "high" | "low";
}

export interface ReceiptScanResponse {
  items: ReceiptLineItem[];
  /** レシート全体から抽出した店舗名（品目ごとではなく1レシート1店舗）。
   *  読み取れない場合は null（#859）。 */
  storeName: string | null;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiContent {
  role?: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig: {
    responseMimeType: string;
    responseSchema: unknown;
    temperature: number;
  };
}

export interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

export type GeminiReceiptResult =
  | { kind: "ok"; data: ReceiptScanResponse }
  | { kind: "timeout" }
  | { kind: "error" };
