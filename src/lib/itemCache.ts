import type { ItemSortKey } from "@/hooks/useItems";
import type { Item } from "@/types/item";

const compareNullableDatesAsc = (
  a: string | null | undefined,
  b: string | null | undefined,
): number => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

const compareNullableDatesDesc = (
  a: string | null | undefined,
  b: string | null | undefined,
): number => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
};

const sortItems = (items: Item[], sort: ItemSortKey): Item[] => {
  return [...items].sort((a, b) => {
    if (sort === "expiry_date") {
      return compareNullableDatesAsc(a.expiry_date, b.expiry_date);
    }

    if (sort === "purchase_date") {
      return compareNullableDatesDesc(a.purchase_date, b.purchase_date);
    }

    return compareNullableDatesDesc(a.created_at, b.created_at);
  });
};

export const upsertItemInListCache = (
  old: unknown,
  incoming: Item,
  sort: ItemSortKey = "created_at",
): Item[] | undefined => {
  if (!Array.isArray(old)) return undefined;

  const currentItems = old as Item[];
  const nextItems = currentItems.some((item) => item.id === incoming.id)
    ? currentItems.map((item) => (item.id === incoming.id ? incoming : item))
    : [...currentItems, incoming];

  return sortItems(nextItems, sort);
};
