// Mirrors src/types/item.ts's resolveItemType for the Deno Edge Function
// runtime (which can't import client-side TS directly). Priority is
// "item override -> category default -> food", same as the client (#937).
export type ItemType = "food" | "daily_goods";

export const DEFAULT_ITEM_TYPE: ItemType = "food";

export const resolveItemType = (
  itemType: ItemType | null | undefined,
  categoryKind: ItemType | null | undefined,
): ItemType => itemType ?? categoryKind ?? DEFAULT_ITEM_TYPE;
