import type { ItemFormValues } from "@/types/item";

/** `receipt-scan` Edge Function が1商品行について返す抽出結果。 */
export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  confidence: "high" | "low";
}

/** レビュー画面（`ReceiptReviewPanel`）で編集する1行分の状態。
 *  `id` は行の同一性を保つためのクライアント側の一時ID（登録には使わない）。 */
export interface ReceiptDraftItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  confidence: "high" | "low";
  categoryId: string | null;
  storageLocationId: string | null;
  /** YYYY-MM-DD。未設定なら null */
  expiryDate: string | null;
  /** チェックを外すと一括登録の対象から除外する */
  included: boolean;
}

/** Gemini抽出結果をレビュー画面用のドラフト行に変換する。
 *  カテゴリ/保管場所/期限日は未確定（null）で始まり、ユーザーが補完する
 *  （receipt-scan.md「フロントエンド」節）。 */
export const receiptLineItemToDraft = (item: ReceiptLineItem): ReceiptDraftItem => ({
  id: crypto.randomUUID(),
  name: item.name,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  confidence: item.confidence,
  categoryId: null,
  storageLocationId: null,
  expiryDate: null,
  included: true,
});

/** 手動追加行（Geminiの抽出漏れをユーザーが補う）用の空ドラフトを作る。 */
export const createBlankDraftItem = (): ReceiptDraftItem => ({
  id: crypto.randomUUID(),
  name: "",
  quantity: 1,
  unitPrice: null,
  confidence: "high",
  categoryId: null,
  storageLocationId: null,
  expiryDate: null,
  included: true,
});

/** 一括登録の対象として有効な行か（除外チェック済み・商品名あり・個数1以上）。 */
export const isReceiptDraftValid = (draft: ReceiptDraftItem): boolean =>
  draft.included && draft.name.trim().length > 0 && draft.quantity >= 1;

/**
 * ドラフト行を既存 `useCreateItem`（`createItem`）にそのまま渡せる
 * `ItemFormValues` に変換する。バーコードは読み取らないため常に未設定
 * （receipt-scan.md「データへの影響」節）。内容量は単位不明のため
 * `content_amount: 1` / `content_unit: "個"`（`itemFormSchema` の既定値と同じ）
 * とし、ユーザーは登録後に必要なら手動で調整する。
 */
export const draftItemToFormValues = (draft: ReceiptDraftItem): ItemFormValues => ({
  name: draft.name.trim(),
  barcode: undefined,
  category_id: draft.categoryId,
  storage_location_id: draft.storageLocationId,
  units: Math.max(1, Math.round(draft.quantity)),
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: undefined,
  expiry_date: draft.expiryDate ?? undefined,
  expiry_type: null,
  notes: undefined,
  image_path: undefined,
  minimum_stock: null,
  days_use_after_opening: null,
  unit_price: draft.unitPrice,
  store_name: undefined,
  auto_reorder: false,
  reorder_threshold: null,
  pin_x: null,
  pin_y: null,
});
