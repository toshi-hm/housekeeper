import { normalizeItemName } from "@/lib/similarItemMatch";
import type { ArchivedShoppingItem } from "@/types/shopping";

/**
 * 買い物リストへの「一緒に買われることが多い」レコメンド（#1009）。
 * `shopping_list_archive` の同一 `archived_at` を1回の「購入完了」操作（＝1回の
 * まとめ買い）とみなす。`archive_purchased_shopping_items()`（DB関数）は
 * `statement_timestamp()` を使って全行に同一タイムスタンプを書き込むため、同じ
 * バッチでアーカイブされた行は厳密に同値になる。対象アイテム名と同じバッチに
 * 含まれていた他の商品名の頻度を数え、上位を返す。
 */

type CooccurrenceSource = Pick<ArchivedShoppingItem, "name" | "archived_at">;

/**
 * `targetName` と一緒に購入されたことが多い商品名を、頻度の高い順に最大 `limit` 件返す。
 * `excludeNames`（既にリストに載っている商品名など）と `targetName` 自身は除外する。
 */
export const buildCooccurrenceSuggestions = (
  archivedItems: readonly CooccurrenceSource[],
  targetName: string,
  excludeNames: readonly string[] = [],
  limit = 2,
): string[] => {
  const normalizedTarget = normalizeItemName(targetName);
  if (!normalizedTarget) return [];

  const excludeSet = new Set(
    [...excludeNames, targetName].map((name) => normalizeItemName(name)).filter(Boolean),
  );

  const groups = new Map<string, CooccurrenceSource[]>();
  for (const item of archivedItems) {
    const list = groups.get(item.archived_at);
    if (list) {
      list.push(item);
    } else {
      groups.set(item.archived_at, [item]);
    }
  }

  const counts = new Map<string, { name: string; count: number }>();
  for (const group of groups.values()) {
    const hasTarget = group.some((row) => normalizeItemName(row.name) === normalizedTarget);
    if (!hasTarget) continue;

    // 同じバッチ内で同じ商品名が複数回出ても、この購入では1回とみなす。
    const seenInGroup = new Set<string>();
    for (const row of group) {
      const normalized = normalizeItemName(row.name);
      if (!normalized || excludeSet.has(normalized) || seenInGroup.has(normalized)) continue;
      seenInGroup.add(normalized);

      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(normalized, { name: row.name, count: 1 });
      }
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => c.name);
};
