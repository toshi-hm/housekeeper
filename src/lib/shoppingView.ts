import type { Item } from "@/types/item";
import type { ShoppingItem } from "@/types/shopping";
import { excludeAlreadyAlertedForecastAlerts } from "@/types/stats";

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

/** 消費ペース予測ベースの低在庫アラート1件分の入力（`computeForecastAlerts` の出力）。 */
export interface ForecastLowStockAlertInput {
  itemId: string;
  predictedRemainingDays: number;
}

/**
 * `minimum_stock` ベースの低在庫アラートと、消費ペース予測ベースの低在庫アラート
 * （`computeForecastAlerts`）をマージする。ダッシュボード（`_auth.index.tsx`）の
 * 重複除外ロジック（#392）と同じく、既に `minimum_stock` ベースのアラートに含まれる
 * アイテムは予測ベースの方を除外する（買い物中モード、#978）。
 */
export const mergeLowStockAlerts = <T extends { id: string }>(
  minimumStockAlerts: T[],
  forecastAlerts: ForecastLowStockAlertInput[],
  items: Pick<Item, "id" | "name">[],
  buildForecastEntry: (item: Pick<Item, "id" | "name">, predictedRemainingDays: number) => T,
): T[] => {
  const minimumStockIds = new Set(minimumStockAlerts.map((entry) => entry.id));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const forecastEntries = excludeAlreadyAlertedForecastAlerts(
    forecastAlerts,
    minimumStockIds,
  ).flatMap((alert) => {
    const item = itemsById.get(alert.itemId);
    return item ? [buildForecastEntry(item, alert.predictedRemainingDays)] : [];
  });
  return [...minimumStockAlerts, ...forecastEntries];
};
