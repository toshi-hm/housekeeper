// Mirrors src/types/item.ts's resolveItemType for the Deno Edge Function
// runtime (which can't import client-side TS directly). Priority is
// "item override -> category default -> food", same as the client (#937).
export type ItemType = "food" | "daily_goods";

export const DEFAULT_ITEM_TYPE: ItemType = "food";

export const resolveItemType = (
  itemType: ItemType | null | undefined,
  categoryKind: ItemType | null | undefined,
): ItemType => itemType ?? categoryKind ?? DEFAULT_ITEM_TYPE;

/**
 * Mirrors src/types/item.ts's dropExpiryForDailyGoods: a category (or item)
 * switched to daily_goods after the fact can still have a stale expiry_date
 * left over in the DB from when it was food (#937). Callers that surface
 * expiry_date (Alexa skill, inventory chat, notifications, exports, ...)
 * must null it out for items whose effective type resolves to daily_goods,
 * rather than reading the raw column value (#966).
 */
export const dropExpiryForDailyGoods = <
  T extends {
    item_type: ItemType | null;
    categories?: { kind: ItemType | null } | null;
    expiry_date: string | null;
  },
>(
  items: T[],
): T[] =>
  items.map((item) =>
    item.expiry_date && resolveItemType(item.item_type, item.categories?.kind) === "daily_goods"
      ? { ...item, expiry_date: null }
      : item,
  );
