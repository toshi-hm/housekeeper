import { getLotRemainingAmount, type Item, type ItemLot } from "@/types/item";

interface Recipe {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  item_id: string;
  amount: number;
  created_at: string;
}

export interface RecipeWithItems extends Recipe {
  items: RecipeItem[];
}

export interface RecipeItemInput {
  item_id: string;
  amount: number;
}

export interface RecipeFormValues {
  name: string;
  items: RecipeItemInput[];
}

/** Minimal item shape needed to compute how much of it remains in stock. */
export type RecipeStockItem = Pick<
  Item,
  "id" | "name" | "units" | "content_amount" | "content_unit" | "opened_remaining"
>;

export interface RecipeShortage {
  item_id: string;
  item_name: string;
  required: number;
  available: number;
  unit: string;
}

export interface RecipeStockCheckResult {
  ok: boolean;
  shortages: RecipeShortage[];
}

/** Minimal FEFO (soonest-expiring) lot shape needed to compute how much of
 *  an item `executeRecipe` would actually be able to consume from in one
 *  `consumeItem` call, which only ever draws from a single lot. */
export type RecipeFefoLot = Pick<ItemLot, "units" | "opened_remaining">;

/**
 * レシピの構成アイテム全件について、在庫が足りているかを判定する。
 * item がまだ取得できていない/削除済みの場合は在庫0として扱う。
 *
 * `fefoLotByItemId` を渡した場合は、そのアイテムの「集計在庫（`items.units`）」
 * ではなく「`consumeItem` が実際に消費する単一ロット（賞味期限が最も近いロット、
 * FEFO）の残量」で判定する。`consumeItem` は複数ロットにまたがって消費すること
 * はないため、集計在庫だけで判定すると「合計では足りているが、消費対象の
 * 単一ロットには足りない」ケースを見逃し、事前チェックが「足りている」と
 * 判定した直後に実消費が insufficientStock で失敗する不整合が起きる。
 * ロットが1件も無いアイテム（`consumeItem` の no-lots フォールバック経路）は
 * 従来通り集計在庫で判定する。
 */
export const checkRecipeStock = (
  recipeItems: Pick<RecipeItem, "item_id" | "amount">[],
  itemsById: Record<string, RecipeStockItem | undefined>,
  fefoLotByItemId: Record<string, RecipeFefoLot | undefined> = {},
): RecipeStockCheckResult => {
  const shortages: RecipeShortage[] = [];

  for (const recipeItem of recipeItems) {
    const item = itemsById[recipeItem.item_id];
    const fefoLot = fefoLotByItemId[recipeItem.item_id];
    const available = !item
      ? 0
      : fefoLot
        ? getLotRemainingAmount(
            fefoLot.units,
            item.content_amount,
            fefoLot.opened_remaining ?? null,
          )
        : getLotRemainingAmount(item.units, item.content_amount, item.opened_remaining ?? null);

    if (available < recipeItem.amount) {
      shortages.push({
        item_id: recipeItem.item_id,
        item_name: item?.name ?? recipeItem.item_id,
        required: recipeItem.amount,
        available,
        unit: item?.content_unit ?? "",
      });
    }
  }

  return { ok: shortages.length === 0, shortages };
};
