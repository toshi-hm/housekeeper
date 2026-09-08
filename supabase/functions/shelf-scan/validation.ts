import { SHELF_SCAN_MIME_TYPES, type ShelfScanMimeType } from "./types.ts";

export const isValidMimeType = (value: unknown): value is ShelfScanMimeType =>
  typeof value === "string" && (SHELF_SCAN_MIME_TYPES as readonly string[]).includes(value);

// receipt-scan/validation.ts §4と同じ8MB相当の上限（ImageUploaderのMAX_RAW_SIZE_BYTES
// を前提に、base64エンコードによる約4/3の膨張分を見込んだサイズ）。
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((8 * 1024 * 1024 * 4) / 3);

export const isValidImagePayload = (image: unknown): image is string =>
  typeof image === "string" && image.length > 0 && image.length <= MAX_IMAGE_BASE64_LENGTH;

export const isValidShelfScanResult = (data: unknown): data is { items: string[] } => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.items) && d.items.every((item) => typeof item === "string");
};

/**
 * Geminiの抽出結果を正規化する: 前後の空白を除去し、空文字になった候補は捨てる。
 * 同一商品が写真内で複数回認識されることがある（例: 同じ商品が2個写っている）ため、
 * 正規化後の文字列で重複を除去する（shelf-scan.md「個数の推定はしない」方針とも
 * 整合し、候補は「1商品名につき1件」に揃える）。
 */
export const normalizeShelfScanItems = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};
