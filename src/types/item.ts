import { z } from "zod";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorageLocation {
  id: string;
  user_id: string;
  name: string;
  icon?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  created_at: string;
}

/** ユーザーが追加した独自の単位（`content_unit` のプリセット `CONTENT_UNITS` を補う）。
 *  `items.content_unit` はこのマスタへの外部キーではなく単なる text のコピーなので、
 *  カスタム単位を削除しても既存アイテムの content_unit 値には影響しない。 */
export interface CustomUnit {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  barcode?: string | null;
  category_id?: string | null;
  storage_location_id?: string | null;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining?: number | null;
  purchase_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  image_path?: string | null;
  minimum_stock?: number | null;
  auto_reorder?: boolean;
  reorder_threshold?: number | null;
  last_verified_at?: string | null;
  deleted_at?: string | null;
  deletion_reason?: ItemDeletionReason | null;
  created_at: string;
  updated_at: string;
}

/** ソフトデリート時の削除理由（#494）。フードロスダッシュボードの集計対象は
 *  'expired_waste' のみ。既存のソフトデリート済み行や、理由選択を経由しない
 *  経路（現状なし）では null のまま残ることがある。 */
export const ITEM_DELETION_REASONS = ["consumed", "expired_waste", "other"] as const;
export type ItemDeletionReason = (typeof ITEM_DELETION_REASONS)[number];

export const itemFormSchema = z.object({
  name: z.string().min(1),
  barcode: z.string().optional(),
  category_id: z.string().uuid().nullable().optional(),
  storage_location_id: z.string().uuid().nullable().optional(),
  units: z.coerce.number().int().min(1).default(1),
  content_amount: z.coerce.number().positive().default(1),
  content_unit: z.string().default("個"),
  opened_remaining: z.coerce.number().min(0).nullable().optional(),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
  image_path: z.string().optional(),
  minimum_stock: z.coerce.number().int().min(0).nullable().optional(),
  /** 1点あたりの購入単価（円）。任意入力、未設定 = null。 */
  unit_price: z.coerce.number().int().min(0).nullable().optional(),
  auto_reorder: z.boolean().default(false),
  reorder_threshold: z.coerce.number().int().min(0).nullable().optional(),
});

export const itemLotSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  item_id: z.string().uuid(),
  units: z.number().int().min(0).default(1),
  opened_remaining: z.number().min(0).nullable().optional(),
  /** 1点あたりの購入単価（円）。null = 未設定（後方互換）。 */
  unit_price: z.number().int().min(0).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export interface UserSettings {
  user_id: string;
  language: "ja" | "en";
  expiry_warning_days: number;
  default_unit: string;
  notify_at: string;
  /** 期限切れ後の自動アーカイブ猶予日数。null = 無効（デフォルト） (#419) */
  auto_archive_after_days: number | null;
  /** 消費ペースからの予測残日数がこの日数以内になったらダッシュボードで警告する（#68, #392）。 */
  low_stock_forecast_days: number;
  stocktake_alert_enabled: boolean;
  stocktake_alert_days: number;
  created_at: string;
  updated_at: string;
}

export type ItemLot = z.infer<typeof itemLotSchema>;
export type ItemFormValues = z.infer<typeof itemFormSchema>;

export type ExpiryStatus = "expired" | "expiring-soon" | "ok" | "unknown";

/** Error codes returned by computeConsumption. Each value is also an i18n key
 *  in the `items` namespace. */
export type ConsumptionError = "insufficientStock";

/** Filters applied server-side (Supabase query). Client-only filters such as
 *  expiryStatus and hideEmpty are handled by the caller after fetching. */
export interface ItemFilters {
  search?: string;
  categoryId?: string;
  storageLocationId?: string;
}

export type ItemSortKey = "expiry_date" | "purchase_date" | "created_at";

export interface ConsumeParams {
  item: Item;
  deltaAmount: number;
  /** Optional free-text memo describing why/how the stock was consumed (#418). */
  note?: string | null;
}

export interface ConsumeLotParams {
  lot: ItemLot;
  item: Pick<Item, "content_amount" | "content_unit">;
  deltaAmount: number;
  /** Optional free-text memo describing why/how the stock was consumed (#418). */
  note?: string | null;
}

/** Preset consumption reasons offered as quick-select chips on the consume
 *  screen. Combined with the free-text note field (#418). */
export type ConsumeReason = "cooking" | "expired" | "gift" | "other";

export const CONSUME_REASONS: readonly ConsumeReason[] = ["cooking", "expired", "gift", "other"];

export const DEFAULT_EXPIRY_WARNING_DAYS = 3;
export const DEFAULT_LOW_STOCK_FORECAST_DAYS = 7;

/** 自動アーカイブを有効化するときにデフォルトで提案する猶予日数 (#419) */
export const DEFAULT_AUTO_ARCHIVE_AFTER_DAYS = 7;

/** 棚卸し（在庫確認）アラートのデフォルトしきい値日数。`user_settings.stocktake_alert_days` で上書き可能。 */
export const DEFAULT_STOCKTAKE_ALERT_DAYS = 90;

/** 一度も確認されていないアイテムを「未確認」とみなすまでの猶予日数（作成日起点、固定値）。 */
export const STOCKTAKE_NEW_ITEM_GRACE_DAYS = 30;

/** プリセットの単位一覧。ユーザーは `custom_units`（`useCustomUnits`）で独自の単位を
 *  追加できる — 参照箇所（ItemForm の単位選択、設定画面のデフォルト単位）はプリセットと
 *  カスタム単位をマージして表示すること。 */
export const CONTENT_UNITS = ["個", "枚", "本", "袋", "mL", "L", "g", "kg"] as const;

export const getExpiryStatus = (
  expiryDate: string | null | undefined,
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
): ExpiryStatus => {
  if (!expiryDate) return "unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = expiryDate.split("-").map(Number) as [number, number, number];
  const expiry = new Date(year, month - 1, day);
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= warningDays) return "expiring-soon";
  return "ok";
};

/**
 * 棚卸し（在庫確認）が必要な「未確認」アイテムかどうかを判定する純関数 (#375)。
 *
 * - `last_verified_at` が未設定（一度も確認されていない）の場合、`created_at` から
 *   {@link STOCKTAKE_NEW_ITEM_GRACE_DAYS} 日以上経過していれば未確認とみなす。
 * - `last_verified_at` が設定されている場合、そこから `stocktakeAlertDays` 日以上
 *   経過していれば未確認とみなす。
 */
export const isItemUnverified = (
  item: Pick<Item, "last_verified_at" | "created_at">,
  stocktakeAlertDays: number = DEFAULT_STOCKTAKE_ALERT_DAYS,
  now: Date = new Date(),
): boolean => {
  const nowMs = now.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;

  if (item.last_verified_at) {
    const verifiedMs = new Date(item.last_verified_at).getTime();
    return (nowMs - verifiedMs) / msPerDay >= stocktakeAlertDays;
  }

  const createdMs = new Date(item.created_at).getTime();
  return (nowMs - createdMs) / msPerDay >= STOCKTAKE_NEW_ITEM_GRACE_DAYS;
};

/** ロット（またはアイテム）1件の実残量を計算する。opened_remaining がある場合は
 *  開封中の1個を除いた残りの未開封数量にopened_remainingを加算する。 */
export const getLotRemainingAmount = (
  units: number,
  contentAmount: number,
  openedRemaining: number | null,
): number =>
  openedRemaining !== null
    ? Math.max(0, units - 1) * contentAmount + openedRemaining
    : units * contentAmount;

/** カードや一覧で使う「残量」の合計値を文字列として返す。 */
export const formatRemaining = (
  units: number,
  contentAmount: number,
  openedRemaining: number | null,
): string => {
  const total = getLotRemainingAmount(units, contentAmount, openedRemaining);
  return total % 1 === 0 ? String(total) : total.toFixed(2).replace(/\.?0+$/, "");
};

// Round to avoid floating-point noise (DB stores numeric(12,2))
export const roundFloat = (n: number) => Math.round(n * 1e10) / 1e10;

export const computeConsumption = (
  item: Pick<Item, "units" | "content_amount" | "content_unit" | "opened_remaining">,
  delta: number,
): {
  units_after: number;
  opened_remaining_after: number | null;
  error?: ConsumptionError;
} => {
  const { content_amount: contentAmount, units } = item;
  const openedRemaining = item.opened_remaining ?? null;

  // Compute total available stock to detect over-consumption before mutating state.
  // When opened_remaining is set, the open unit is already counted in `units`,
  // so sealed units = units - 1.
  const totalBefore =
    units === 0
      ? 0
      : openedRemaining !== null
        ? (units - 1) * contentAmount + openedRemaining
        : units * contentAmount;

  if (delta > totalBefore) {
    return { units_after: 0, opened_remaining_after: null, error: "insufficientStock" };
  }

  const totalAfter = roundFloat(totalBefore - delta);

  if (totalAfter === 0) {
    return { units_after: 0, opened_remaining_after: null };
  }

  const sealedUnits = Math.floor(roundFloat(totalAfter / contentAmount));
  const openedAfter = roundFloat(totalAfter - sealedUnits * contentAmount);

  if (openedAfter === 0) {
    return { units_after: sealedUnits, opened_remaining_after: null };
  }
  return { units_after: sealedUnits + 1, opened_remaining_after: openedAfter };
};
