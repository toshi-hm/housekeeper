import { toLocalDateKey } from "@/lib/dateUtils";
import type { ArchivedShoppingItem } from "@/types/shopping";

export interface PurchaseHistoryGroup {
  /** ローカル日付キー（YYYY-MM-DD） */
  dateKey: string;
  items: ArchivedShoppingItem[];
}

/**
 * 購入履歴（アーカイブ）を archived_at のローカル日付でグループ化する。
 * グループは新しい日付が先頭、各グループ内は元の並び順（呼び出し側が
 * archived_at desc で渡す想定）を維持する。
 */
export const groupArchivedItemsByDate = (
  items: readonly ArchivedShoppingItem[],
): PurchaseHistoryGroup[] => {
  const groups = new Map<string, ArchivedShoppingItem[]>();
  for (const item of items) {
    const key = toLocalDateKey(new Date(item.archived_at));
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dateKey, groupItems]) => ({ dateKey, items: groupItems }));
};
