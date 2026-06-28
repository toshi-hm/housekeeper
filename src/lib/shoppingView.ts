import type { ShoppingItem } from "@/types/shopping";

/** 買い物リストの並び順。`category` のときはカテゴリ別グループ表示になる。 */
export type ShoppingSortKey = "added" | "category" | "name" | "priority";

export const SHOPPING_SORT_KEYS = ["added", "category", "name", "priority"] as const;

export const isShoppingSortKey = (value: string): value is ShoppingSortKey =>
  (SHOPPING_SORT_KEYS as readonly string[]).includes(value);

export interface ResolvedCategory {
  id: string;
  name: string;
  color: string | null;
}

/** 買い物アイテム（`linked_item_id` 経由）からカテゴリを解決する。未分類は null。 */
export type CategoryResolver = (item: ShoppingItem) => ResolvedCategory | null;

const collator = new Intl.Collator("ja");

/**
 * 並び順に応じて買い物アイテムを並べ替える。
 * `added` は元の追加順（呼び出し側が created_at desc で渡す）を維持する。
 */
export const sortShoppingItems = (
  items: ShoppingItem[],
  sortKey: ShoppingSortKey,
  resolveCategory: CategoryResolver,
): ShoppingItem[] => {
  const sorted = [...items];
  switch (sortKey) {
    case "name":
      sorted.sort((a, b) => collator.compare(a.name, b.name));
      break;
    case "priority":
      sorted.sort((a, b) => b.desired_units - a.desired_units || collator.compare(a.name, b.name));
      break;
    case "category":
      sorted.sort((a, b) => {
        const ca = resolveCategory(a)?.name ?? null;
        const cb = resolveCategory(b)?.name ?? null;
        if (ca === cb) return collator.compare(a.name, b.name);
        if (ca === null) return 1; // 未分類は末尾
        if (cb === null) return -1;
        return collator.compare(ca, cb);
      });
      break;
    case "added":
      break;
  }
  return sorted;
};

export interface ShoppingGroup {
  /** 未分類グループは null */
  categoryId: string | null;
  categoryName: string | null;
  color: string | null;
  items: ShoppingItem[];
}

const OTHER_KEY = "__other__";

/**
 * 買い物アイテムをカテゴリ別にグループ化する。
 * グループはカテゴリ名昇順、未分類（その他）は末尾。各グループ内は名前順。
 */
export const groupShoppingItemsByCategory = (
  items: ShoppingItem[],
  resolveCategory: CategoryResolver,
): ShoppingGroup[] => {
  const groups = new Map<string, ShoppingGroup>();
  for (const item of items) {
    const cat = resolveCategory(item);
    const key = cat?.id ?? OTHER_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: cat?.id ?? null,
        categoryName: cat?.name ?? null,
        color: cat?.color ?? null,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => collator.compare(a.name, b.name));
  }

  return [...groups.values()].sort((a, b) => {
    if (a.categoryName === b.categoryName) return 0;
    if (a.categoryName === null) return 1;
    if (b.categoryName === null) return -1;
    return collator.compare(a.categoryName, b.categoryName);
  });
};
