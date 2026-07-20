import { z } from "zod";

import { getLotRemainingAmount, type Item } from "@/types/item";

export interface Recipe {
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

export const recipeItemInputSchema = z.object({
  item_id: z.string().min(1),
  amount: z.coerce.number().positive(),
});

export const recipeFormSchema = z.object({
  name: z.string().min(1),
  items: z.array(recipeItemInputSchema).min(1),
});

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;

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

/**
 * レシピの構成アイテム全件について、在庫が足りているかを判定する。
 * item がまだ取得できていない/削除済みの場合は在庫0として扱う。
 */
export const checkRecipeStock = (
  recipeItems: Pick<RecipeItem, "item_id" | "amount">[],
  itemsById: Record<string, RecipeStockItem | undefined>,
): RecipeStockCheckResult => {
  const shortages: RecipeShortage[] = [];

  for (const recipeItem of recipeItems) {
    const item = itemsById[recipeItem.item_id];
    const available = item
      ? getLotRemainingAmount(item.units, item.content_amount, item.opened_remaining ?? null)
      : 0;

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
