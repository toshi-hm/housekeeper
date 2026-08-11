import { RECEIPT_MIME_TYPES, type ReceiptLineItem, type ReceiptMimeType } from "./types.ts";

export const isValidMimeType = (value: unknown): value is ReceiptMimeType =>
  typeof value === "string" && (RECEIPT_MIME_TYPES as readonly string[]).includes(value);

// #696 §4: base64 payload is capped at roughly the 8MB raw-image target
// (ImageUploader's MAX_RAW_SIZE_BYTES guards the raw file size on the client;
// base64 encoding inflates that by ~4/3, so the wire-format limit here is
// sized accordingly). Checked on the raw string length before any decoding
// so an oversized payload is rejected cheaply.
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((8 * 1024 * 1024 * 4) / 3);

export const isValidImagePayload = (image: unknown): image is string =>
  typeof image === "string" && image.length > 0 && image.length <= MAX_IMAGE_BASE64_LENGTH;

const isValidConfidence = (value: unknown): value is "high" | "low" =>
  value === "high" || value === "low";

const isValidLineItem = (item: unknown): item is ReceiptLineItem => {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  return (
    typeof it.name === "string" &&
    it.name.trim().length > 0 &&
    typeof it.quantity === "number" &&
    (it.unitPrice === null || typeof it.unitPrice === "number") &&
    isValidConfidence(it.confidence)
  );
};

export const isValidReceiptScanResult = (data: unknown): data is { items: ReceiptLineItem[] } => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.items) && d.items.every(isValidLineItem);
};

/**
 * Gemini はプロンプトで指示しても稀に個数0以下・不正な小数を返すことがあるため、
 * レビュー画面に渡す前に正規化する。読み取れなかった個数は1として扱う
 * （receipt-scan.md「レスポンス」節: 「読み取れない場合は1」）。
 */
export const normalizeLineItem = (item: ReceiptLineItem): ReceiptLineItem => ({
  name: item.name.trim(),
  quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? Math.round(item.quantity) : 1,
  unitPrice: item.unitPrice !== null && item.unitPrice >= 0 ? Math.round(item.unitPrice) : null,
  confidence: item.confidence,
});
