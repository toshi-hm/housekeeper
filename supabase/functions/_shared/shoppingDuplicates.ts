// Mirrors src/lib/shoppingDuplicates.ts's findDuplicatePlannedItem for the Deno
// Edge Function runtime (which can't import client-side TS directly). Any
// insert path into shopping_list_items must apply the same duplicate rule as
// the web app's upsertShoppingItem, or it can trip the DB-level partial
// unique indexes (shopping_planned_linked_item_unique /
// shopping_planned_name_unique) that back that rule (#946).
export interface ShoppingPlannedRow {
  id: string;
  name: string;
  desired_units: number;
  linked_item_id: string | null;
}

/**
 * 新規追加しようとしている入力に対して、既存の planned 行の中から統合すべき
 * 重複行を探す。同一 linked_item_id、または同名（前後空白を無視し大文字小文字
 * を区別しない）の行があれば重複とみなす (#522, #447)。見つからなければ undefined。
 */
export const findDuplicatePlannedItem = (
  plannedRows: readonly ShoppingPlannedRow[],
  input: { name: string; linked_item_id: string | null },
): ShoppingPlannedRow | undefined => {
  const normalizedName = input.name.trim().toLowerCase();
  return plannedRows.find(
    (row) =>
      (input.linked_item_id && row.linked_item_id === input.linked_item_id) ||
      row.name.trim().toLowerCase() === normalizedName,
  );
};
