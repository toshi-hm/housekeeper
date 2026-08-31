import { type ItemType, resolveItemType } from "../_shared/itemType.ts";

/**
 * PWA Web App Widgets（実験的機能, #367）向けのサマリー生成ロジック。
 *
 * ホーム画面ウィジェットは「期限切れ／期限間近の件数」と「低在庫の件数」、
 * および代表アイテムを一目で確認できることを目的とする。
 * 期限切れ・期限間近の判定基準（units>0 かつ opened_remaining!==0）は、
 * send-expiry-notifications（supabase/functions/send-expiry-notifications/index.ts, #445）と
 * 同じもの。ダッシュボードの urgentItems（src/routes/_auth.index.tsx, #450）は
 * units>0 のみで opened_remaining は見ておらず、判定基準が異なる点に注意。
 * 低在庫はダッシュボードの lowStockItems と同じ（minimum_stock が設定されていて
 * units <= minimum_stock）。低在庫はアイテム種別に関係なく（日用品こそ主役、
 * docs/specs/features/item-type.md 影響範囲節）従来通り対象にする。
 *
 * Deno Edge Function 側は import map / パスエイリアスを共有できないため、
 * フロントエンドの src/types/item.ts の判定ロジックをこのファイルに複製している。
 * 判定基準を変更する場合は両方を同期させること。
 *
 * #940: 既存カテゴリを後から日用品へ切り替えた場合、そのカテゴリのアイテムには
 * 食料品時代に入力された expiry_date が DB に残ったままになる
 * （docs/specs/features/item-type.md の既知のギャップ）。send-expiry-notifications
 * （#937）と同様、実効種別（resolveItemType, ../_shared/itemType.ts）が daily_goods の
 * アイテムは期限集計（expired_count/expiring_soon_count/top_expiring）から除外する。
 * 低在庫（top_low_stock/low_stock_count）は種別を問わず対象のまま。
 */

export interface WidgetItemInput {
  name: string;
  units: number;
  expiry_date: string | null;
  opened_remaining: number | null;
  minimum_stock: number | null;
  item_type: ItemType | null;
  categories: { kind: ItemType | null } | null;
}

export type WidgetExpiryStatus = "expired" | "expiring-soon";

export interface WidgetExpiringItem {
  name: string;
  expiry_date: string;
  status: WidgetExpiryStatus;
}

export interface WidgetLowStockItem {
  name: string;
  units: number;
  minimum_stock: number;
}

export interface WidgetSummary {
  generated_at: string;
  expired_count: number;
  expiring_soon_count: number;
  low_stock_count: number;
  top_expiring: WidgetExpiringItem[];
  top_low_stock: WidgetLowStockItem[];
}

/** ウィジェットに表示する代表アイテムの最大件数（小サイズウィジェットでも収まる件数）。 */
export const WIDGET_TOP_N = 5;

const diffDaysFromDateStrings = (fromStr: string, toStr: string): number => {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
};

const getExpiryStatus = (
  expiryDate: string | null,
  todayStr: string,
  warningDays: number,
): WidgetExpiryStatus | "ok" | "unknown" => {
  if (!expiryDate) return "unknown";
  const diffDays = diffDaysFromDateStrings(todayStr, expiryDate);
  if (diffDays < 0) return "expired";
  if (diffDays <= warningDays) return "expiring-soon";
  return "ok";
};

/**
 * items からウィジェット表示用のサマリーを組み立てる（純粋関数・Supabase 依存なし）。
 *
 * @param items 対象ユーザーの items（削除済みは呼び出し側で除外しておくこと）
 * @param todayStr JST 基準の「今日」（YYYY-MM-DD）
 * @param warningDays 期限間近とみなす残り日数（user_settings.expiry_warning_days）
 * @param nowIso レスポンスの generated_at に使う ISO 日時文字列
 */
export const buildWidgetSummary = (
  items: WidgetItemInput[],
  todayStr: string,
  warningDays: number,
  nowIso: string,
): WidgetSummary => {
  // 期限切れ／期限間近: 在庫が残っており（units > 0）、開封済みで空でない
  // （opened_remaining !== 0）アイテムのみ対象（send-expiry-notifications と同じ基準）。
  // #940: 実効種別が daily_goods のアイテム（日用品へ切り替え後も expiry_date が
  // DB に残っている旧食料品）は、期限バッジの集計対象から除外する。
  const activeForExpiry = items.filter(
    (item) =>
      item.units > 0 &&
      item.opened_remaining !== 0 &&
      resolveItemType(item.item_type, item.categories?.kind) !== "daily_goods",
  );

  const expiring = activeForExpiry
    .map((item) => ({ item, status: getExpiryStatus(item.expiry_date, todayStr, warningDays) }))
    .filter(
      (entry): entry is { item: WidgetItemInput; status: WidgetExpiryStatus } =>
        entry.status === "expired" || entry.status === "expiring-soon",
    )
    .sort((a, b) => (a.item.expiry_date ?? "").localeCompare(b.item.expiry_date ?? ""));

  const expiredCount = expiring.filter((entry) => entry.status === "expired").length;
  const expiringSoonCount = expiring.filter((entry) => entry.status === "expiring-soon").length;

  const topExpiring: WidgetExpiringItem[] = expiring.slice(0, WIDGET_TOP_N).map((entry) => ({
    name: entry.item.name,
    // フィルタで expiry_date を持つもののみ残しているため non-null
    expiry_date: entry.item.expiry_date as string,
    status: entry.status,
  }));

  // 低在庫: minimum_stock が設定されていて units <= minimum_stock のアイテム
  // （ダッシュボードの lowStockItems と同じ基準。units=0 も含む）。
  const lowStock = items.filter(
    (item): item is WidgetItemInput & { minimum_stock: number } =>
      item.minimum_stock !== null &&
      item.minimum_stock !== undefined &&
      item.units <= item.minimum_stock,
  );

  const topLowStock: WidgetLowStockItem[] = lowStock.slice(0, WIDGET_TOP_N).map((item) => ({
    name: item.name,
    units: item.units,
    minimum_stock: item.minimum_stock,
  }));

  return {
    generated_at: nowIso,
    expired_count: expiredCount,
    expiring_soon_count: expiringSoonCount,
    low_stock_count: lowStock.length,
    top_expiring: topExpiring,
    top_low_stock: topLowStock,
  };
};
