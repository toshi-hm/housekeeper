// Mirrors src/lib/shoppingDuplicates.ts's findDuplicatePlannedItem for the Deno
// Edge Function runtime (which can't import client-side TS directly). Used by
// the Alexa skill's shopping-list handlers so they merge into an existing
// `planned` row instead of bypassing the web app's dedup logic (#946).
export interface ShoppingPlannedRow {
  id: string;
  name: string;
  desired_units: number;
  linked_item_id: string | null;
}

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
