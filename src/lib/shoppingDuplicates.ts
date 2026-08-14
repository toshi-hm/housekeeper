import type { ShoppingItem, UpsertShoppingItemInput } from "@/types/shopping";

/**
 * 新規追加しようとしている買い物リスト入力に対して、既存の planned 行の中から
 * 統合すべき重複行を探す。同一 linked_item_id、または同名（前後空白を無視し
 * 大文字小文字を区別しない）の行があれば重複とみなす (#522, #447)。
 *
 * `useShoppingList.ts`（手動追加・テンプレート適用）と `autoReorder.ts`
 * （自動追加）の両方から参照される共有ロジック。両者を同じファイルに置くと
 * `autoReorder.ts` → `useShoppingList.ts` → `useItemLots.ts`/`useItems.ts` →
 * `autoReorder.ts` の循環importになるため、依存のない単独モジュールに分離している。
 */
export const findDuplicatePlannedItem = (
  plannedRows: readonly ShoppingItem[],
  input: Pick<UpsertShoppingItemInput, "name" | "linked_item_id">,
): ShoppingItem | undefined => {
  const normalizedName = input.name.trim().toLowerCase();
  return plannedRows.find(
    (row) =>
      (input.linked_item_id && row.linked_item_id === input.linked_item_id) ||
      row.name.trim().toLowerCase() === normalizedName,
  );
};
