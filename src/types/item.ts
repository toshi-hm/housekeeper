import { z } from "zod";

/** アイテム種別（食料品 / 日用品）。日用品は期限（expiry_date / expiry_type）を
 *  持たない前提で、登録フォームから期限入力欄を省き、ダッシュボードでは食料品と
 *  別タブに分けて表示する。詳細は docs/specs/features/item-type.md。 */
export const ITEM_TYPES = ["food", "daily_goods"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** カテゴリ既定もアイテム個別設定も無いときの種別。既存データ（食料品前提で
 *  登録されてきたアイテム）の挙動をそのまま保つため food とする。 */
export const DEFAULT_ITEM_TYPE: ItemType = "food";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  /** このカテゴリに属するアイテムの既定の種別。items.item_type が未設定の
   *  アイテムはこの値にフォールバックする。既存カテゴリは全て "food"。 */
  kind?: ItemType;
  /** 開封後使用推奨日数の既定値。items.days_use_after_opening が未設定の
   *  アイテムはこの値にフォールバックする（#752）。 */
  days_use_after_opening?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StorageLocation {
  id: string;
  user_id: string;
  name: string;
  icon?: string | null;
  photo_path?: string | null;
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

/** 「賞味期限」（best_before, 品質の目安 = 過ぎても食べられることが多い）と
 *  「消費期限」（use_by, 安全性の目安 = 過ぎたら食べない方がよい）の区別 (#714)。
 *  日本の食品表示の区分に対応する。 */
export const EXPIRY_TYPES = ["best_before", "use_by"] as const;
export type ExpiryType = (typeof EXPIRY_TYPES)[number];

export interface Item {
  id: string;
  user_id: string;
  name: string;
  barcode?: string | null;
  category_id?: string | null;
  /** アイテム種別の個別上書き。null = カテゴリの kind に従う
   *  （カテゴリ未設定なら DEFAULT_ITEM_TYPE）。{@link resolveItemType} で解決する。 */
  item_type?: ItemType | null;
  storage_location_id?: string | null;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining?: number | null;
  purchase_date?: string | null;
  expiry_date?: string | null;
  /** 「賞味期限」（品質の目安）か「消費期限」（安全性の目安）かの区別 (#714)。
   *  null = 未設定・区別なし（既存アイテムは全て null のままで、これまで通りの
   *  一律の期限扱いを維持する）。 */
  expiry_type?: ExpiryType | null;
  /** item_lots からの集計値: 現在開封中のロットのうち最も古い開封日時。
   *  未開封（またはロットなし）なら null（#752）。 */
  opened_at?: string | null;
  /** 開封後使用推奨日数（個別上書き）。null = category.days_use_after_opening
   *  にフォールバック（#752）。 */
  days_use_after_opening?: number | null;
  notes?: string | null;
  image_path?: string | null;
  minimum_stock?: number | null;
  auto_reorder?: boolean;
  reorder_threshold?: number | null;
  /** 消費ペース予測（`computeConsumptionPaceForecast`）に基づく自動追加のしきい値（日数）。
   *  `auto_reorder = true` のアイテムで、予測残日数がこの値以下になったら
   *  `reorder_threshold` の判定とは独立に自動的に買い物リストへ追加する。
   *  null = 予測残日数による自動追加を使わない（既存の個数しきい値のみ、#853）。 */
  reorder_lead_days?: number | null;
  last_verified_at?: string | null;
  deleted_at?: string | null;
  deletion_reason?: ItemDeletionReason | null;
  /** 保管場所の写真上の相対位置（0〜1）。保管場所に写真が未登録、または未指定の場合は null（#574）。 */
  pin_x?: number | null;
  pin_y?: number | null;
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
  /** アイテム種別の個別上書き。未選択 = null（カテゴリ既定に追従）。 */
  item_type: z.enum(ITEM_TYPES).nullable().optional(),
  storage_location_id: z.string().uuid().nullable().optional(),
  units: z.coerce.number().int().min(1).default(1),
  content_amount: z.coerce.number().positive().default(1),
  content_unit: z.string().default("個"),
  opened_remaining: z.coerce.number().min(0).nullable().optional(),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  /** 「賞味期限」/「消費期限」の区別。未選択 = null（区別なし、#714）。 */
  expiry_type: z.enum(EXPIRY_TYPES).nullable().optional(),
  notes: z.string().optional(),
  image_path: z.string().optional(),
  minimum_stock: z.coerce.number().int().min(0).nullable().optional(),
  /** 開封後使用推奨日数（個別上書き）。任意入力、未設定 = null
   *  （category.days_use_after_opening にフォールバック、#752）。 */
  days_use_after_opening: z.coerce.number().int().positive().nullable().optional(),
  /** 1点あたりの購入単価（円）。任意入力、未設定 = null。 */
  unit_price: z.coerce.number().int().min(0).nullable().optional(),
  /** 購入先の店舗名。任意入力、未設定 = null（#697）。 */
  store_name: z.string().nullable().optional(),
  auto_reorder: z.boolean().default(false),
  reorder_threshold: z.coerce.number().int().min(0).nullable().optional(),
  /** 予測残日数ベースの自動追加しきい値（日数）。未設定 = null（#853）。 */
  reorder_lead_days: z.coerce.number().int().min(0).nullable().optional(),
  pin_x: z.coerce.number().min(0).max(1).nullable().optional(),
  pin_y: z.coerce.number().min(0).max(1).nullable().optional(),
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
  /** 購入先の店舗名。null = 未設定（後方互換, #697）。 */
  store_name: z.string().nullable().optional(),
  /** このロットが最初に開封された日時。DBトリガーが opened_remaining の
   *  null <-> 非null 遷移から自動的に設定/クリアする（#752）。 */
  opened_at: z.string().nullable().optional(),
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
  /** 手動JSONエクスポート（唯一のバックアップ導線）が最後に成功した日時。null = 未実行 (#815) */
  last_backup_export_at: string | null;
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

/** バーコード再スキャン時に「すでに在庫あり」バナーを出すかどうかの判定 (#559)。
 *  未開封の点数か、開封中の残量のいずれかがあれば在庫ありとみなす。
 *  使い切り済み（units=0 かつ opened_remaining が 0 または未設定）は除外する。 */
export const isAlreadyInStock = (item: Pick<Item, "units" | "opened_remaining">): boolean =>
  item.units > 0 || (item.opened_remaining ?? 0) > 0;

/** #650: createItem / purchaseShoppingItem の結果が「新規作成」ではなく、既存アイテムを
 *  スタック（在庫加算）またはソフトデリートから復活させたものかどうか。true の場合、
 *  呼び出し側は選択した画像・タグで既存アイテムの値を上書きしてはならない。 */
export const targetsExistingItem = (result: { _stacked?: boolean; _revived?: boolean }): boolean =>
  Boolean(result._stacked || result._revived);

/** 期限までの残り日数を「日」または「ヶ月」単位のおおよその値に丸めた結果 (#559)。
 *  60日未満は日数、それ以上は30日=1ヶ月換算で月数に丸める。 */
export interface ExpiryApprox {
  unit: "day" | "month";
  value: number;
  isPast: boolean;
}

const APPROX_MONTH_THRESHOLD_DAYS = 60;
const DAYS_PER_MONTH = 30;

/** `expiryDate` (YYYY-MM-DD) から「期限まで約2ヶ月」のような表示に使う概算値を求める純関数。 */
export const getExpiryApprox = (expiryDate: string, now: Date = new Date()): ExpiryApprox => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [year, month, day] = expiryDate.split("-").map(Number) as [number, number, number];
  const expiry = new Date(year, month - 1, day);
  const diffDays = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isPast = diffDays < 0;
  const absDays = Math.abs(diffDays);

  if (absDays >= APPROX_MONTH_THRESHOLD_DAYS) {
    return { unit: "month", value: Math.max(1, Math.round(absDays / DAYS_PER_MONTH)), isPast };
  }
  return { unit: "day", value: absDays, isPast };
};

/** プリセットの単位一覧。ユーザーは `custom_units`（`useCustomUnits`）で独自の単位を
 *  追加できる — 参照箇所（ItemForm の単位選択、設定画面のデフォルト単位）はプリセットと
 *  カスタム単位をマージして表示すること。 */
export const CONTENT_UNITS = ["個", "枚", "本", "袋", "mL", "L", "g", "kg"] as const;

/**
 * `expiry_date` と警告日数から4状態（expired/expiring-soon/ok/unknown）を判定する。
 *
 * 日付のみに基づく判定であり、`expiry_type`（賞味期限/消費期限）による分岐は
 * 含まない — この4状態は絞り込み・ソート・カレンダー表示など、区別を気にしない
 * 既存の呼び出し元が多数あるため（#714 時点で維持すべき契約）。
 * `expired`/`expiring-soon` を「賞味期限なら穏やかに、消費期限ならより強く」
 * 表示し分けたい呼び出し元（`ExpiryBadge` など）は、この結果を
 * {@link getExpirySeverity} に渡して表示用の重大度を求めること。
 */
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

/** {@link getExpiryStatus} の4状態に `expiry_type` による重大度の強弱を加えた
 *  表示用の値 (#714)。
 *
 * - `expired` + `use_by`（消費期限）または未設定 = `danger`（従来通りの赤/危険表示）
 * - `expired` + `best_before`（賞味期限）= `caution`（品質の目安を過ぎただけで
 *   安全性の問題ではないため、穏やかな表示に留める）
 * - `expiring-soon` は区別の有無に関わらず `warning`
 * - `ok` / `unknown` はそのまま
 */
export type ExpirySeverity = "danger" | "caution" | "warning" | "ok" | "unknown";

export const getExpirySeverity = (
  status: ExpiryStatus,
  expiryType?: ExpiryType | null,
): ExpirySeverity => {
  if (status === "expired") return expiryType === "best_before" ? "caution" : "danger";
  if (status === "expiring-soon") return "warning";
  return status;
};

/**
 * アイテムの実効種別（食料品 / 日用品）を解決する純関数。
 * 優先順位は「アイテム個別の上書き → カテゴリの既定 → {@link DEFAULT_ITEM_TYPE}」で、
 * {@link resolveOpenedAlertThresholdDays} と同じ2層構造。カテゴリ未設定のアイテムは
 * 食料品として扱う（従来挙動の維持）。
 */
export const resolveItemType = (
  item: Pick<Item, "item_type">,
  category?: Pick<Category, "kind"> | null,
): ItemType => item.item_type ?? category?.kind ?? DEFAULT_ITEM_TYPE;

/**
 * 開封後使用推奨日数の有効値を解決する (#752)。
 * アイテム個別の設定（`item.days_use_after_opening`）が優先され、未設定なら
 * カテゴリの既定値（`category.days_use_after_opening`）にフォールバックする。
 * どちらも未設定なら `null`（開封後アラート機能自体を使わない）。
 */
export const resolveOpenedAlertThresholdDays = (
  item: Pick<Item, "days_use_after_opening">,
  category?: Pick<Category, "days_use_after_opening"> | null,
): number | null => item.days_use_after_opening ?? category?.days_use_after_opening ?? null;

/**
 * `since` から `now` までの経過日数（切り捨て）。無効な日付文字列なら `null`。
 * `now` は明示的に渡さない限り呼び出し時点の `new Date()`（呼び出し元での
 * 評価に委ねるため、この関数自体は純関数のまま — コンポーネントの render 内で
 * 直接 `Date.now()`/`new Date()` を呼ぶと react-hooks/purity lint に引っかかる
 * ため、バッジ側はこのヘルパー経由で日数を得る、#752）。
 */
export const getElapsedDays = (
  since: string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!since) return null;
  const sinceMs = new Date(since).getTime();
  if (Number.isNaN(sinceMs)) return null;
  return Math.floor((now.getTime() - sinceMs) / (1000 * 60 * 60 * 24));
};

/**
 * 開封後アラートを表示すべきか判定する純関数 (#752)。
 * `openedAt`（開封日時）と有効な推奨日数がともに設定されていて、
 * 経過日数がその日数以上であれば `true`。未開封（`openedAt` が null）や
 * 推奨日数が未設定（`thresholdDays` が null）の場合は常に `false`
 * （＝賞味期限/消費期限バッジとは独立した別枠のアラートなので、判定材料が
 * 揃わない限り何も表示しない）。
 */
export const isOpenedAlertDue = (
  openedAt: string | null | undefined,
  thresholdDays: number | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!thresholdDays) return false;
  const elapsedDays = getElapsedDays(openedAt, now);
  return elapsedDays !== null && elapsedDays >= thresholdDays;
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

/** JSONエクスポート（唯一のバックアップ導線）の未実行リマインダーの猶予日数 (#815)。 */
export const BACKUP_EXPORT_REMINDER_DAYS = 30;

/**
 * JSONエクスポート（唯一のバックアップ/リカバリー導線、`DataExportPanel`）が長期間
 * 未実行かどうかを判定する純関数 (#815)。
 *
 * - `last_backup_export_at` が設定されていればそこから、未設定（一度もエクスポート
 *   していない）ならアカウント作成日（`user_settings.created_at`）からの経過日数で判定する。
 */
export const isBackupExportOverdue = (
  settings: Pick<UserSettings, "last_backup_export_at" | "created_at">,
  reminderDays: number = BACKUP_EXPORT_REMINDER_DAYS,
  now: Date = new Date(),
): boolean => {
  const nowMs = now.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const baseline = settings.last_backup_export_at ?? settings.created_at;
  return (nowMs - new Date(baseline).getTime()) / msPerDay >= reminderDays;
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
  const totalBefore = roundFloat(
    units === 0
      ? 0
      : openedRemaining !== null
        ? (units - 1) * contentAmount + openedRemaining
        : units * contentAmount,
  );

  if (roundFloat(delta) > totalBefore) {
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
