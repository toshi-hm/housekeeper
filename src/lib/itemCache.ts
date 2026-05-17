import type { Item } from "@/types/item";

export const upsertItemInListCache = (old: unknown, incoming: Item): Item[] | undefined => {
  if (!Array.isArray(old)) return undefined;
  const index = (old as Item[]).findIndex((item) => item.id === incoming.id);
  if (index === -1) return [incoming, ...(old as Item[])];
  return (old as Item[]).map((item) => (item.id === incoming.id ? incoming : item));
};
