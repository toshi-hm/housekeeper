export const SHELF_SCAN_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ShelfScanMimeType = (typeof SHELF_SCAN_MIME_TYPES)[number];

export interface ShelfScanRequest {
  /** 生base64（先頭の data:...;base64, は除去済みの前提）。receipt-scanと同じ規約。 */
  image: string;
  mimeType: ShelfScanMimeType;
}

/**
 * shelf-scan.md「やらないこと」節: 個数・内包量の写真からの推定はしない。
 * 返すのは写っている商品名候補の配列のみ（重複は正規化時に除去済み）。
 */
export interface ShelfScanResponse {
  items: string[];
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

export type GeminiShelfScanResult =
  | { kind: "ok"; data: ShelfScanResponse }
  | { kind: "timeout" }
  | { kind: "error" };
