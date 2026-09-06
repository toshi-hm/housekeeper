import { type ItemType, resolveItemType } from "../_shared/itemType.ts";
import {
  getElapsedDays,
  isOpenedAlertDue,
  resolveOpenedAlertThresholdDays,
} from "../_shared/openedAlert.ts";
import type { OpenedAlertNotificationItem } from "./content.ts";

// #967: 開封後アラート対象を抽出するための元データ。expiry_date ベースの
// ExpiringItem とは別クエリ・別テーブル行として取得する（対象アイテムの重なりが
// あってもよい — 期限接近と開封後アラートは独立した条件のため、同じアイテムが
// 両方の集合に入ることもある）。
export interface OpenedAlertItemRow {
  id: string;
  name: string;
  opened_at: string | null;
  days_use_after_opening: number | null;
  item_type: ItemType | null;
  categories: { kind: ItemType | null; days_use_after_opening: number | null } | null;
}

/**
 * `items` テーブルから取得した生の行を、開封後アラート通知の対象
 * （{@link OpenedAlertNotificationItem}）へ絞り込む純関数（#967）。
 *
 * - 実効種別（{@link resolveItemType}、#937と同じ判定）が `daily_goods` の行は
 *   除外する（日用品は期限概念を持たない方針、item-type.md）。
 * - 推奨使用日数はアイテム個別設定 → カテゴリ既定値の順に解決する
 *   （{@link resolveOpenedAlertThresholdDays}）。
 * - `opened_at` が未設定、または経過日数がしきい値未満の行は除外する
 *   （{@link isOpenedAlertDue}）。
 */
export const selectOpenedAlertItems = (
  rows: readonly OpenedAlertItemRow[],
  now: Date = new Date(),
): OpenedAlertNotificationItem[] =>
  rows
    .filter((row) => resolveItemType(row.item_type, row.categories?.kind) !== "daily_goods")
    .flatMap((row) => {
      const thresholdDays = resolveOpenedAlertThresholdDays(
        { days_use_after_opening: row.days_use_after_opening },
        row.categories,
      );
      if (!isOpenedAlertDue(row.opened_at, thresholdDays, now)) return [];
      // isOpenedAlertDue が true を返した以上 opened_at は有効な日付文字列で
      // あることが保証されているため、getElapsedDays は null を返さない。
      const elapsedDays = getElapsedDays(row.opened_at, now)!;
      return [{ id: row.id, name: row.name, elapsedDays }];
    });
