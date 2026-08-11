import { getExpiryStatus, getLotRemainingAmount, type Item, type ItemLot } from "@/types/item";

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
 *
 * 同一 item_id が複数行にまたがる場合は、行ごとに独立して判定するのではなく
 * 必要量を合算してから在庫と比較する（#765）。行ごとの独立判定だと、各行が
 * 同じ在庫スナップショットに対して個別に「足りている」と判定してしまい、
 * 合計では不足していても事前チェックをすり抜ける（実行時は `executeRecipe` が
 * 順番に `consumeItem` を呼ぶため、1行目消費後に在庫が尽きて2行目以降が失敗する）。
 */
export const checkRecipeStock = (
  recipeItems: Pick<RecipeItem, "item_id" | "amount">[],
  itemsById: Record<string, RecipeStockItem | undefined>,
  fefoLotByItemId: Record<string, RecipeFefoLot | undefined> = {},
): RecipeStockCheckResult => {
  const shortages: RecipeShortage[] = [];

  const requiredByItemId = new Map<string, number>();
  for (const recipeItem of recipeItems) {
    requiredByItemId.set(
      recipeItem.item_id,
      (requiredByItemId.get(recipeItem.item_id) ?? 0) + recipeItem.amount,
    );
  }

  for (const [itemId, required] of requiredByItemId) {
    const item = itemsById[itemId];
    const fefoLot = fefoLotByItemId[itemId];
    const available = !item
      ? 0
      : fefoLot
        ? getLotRemainingAmount(
            fefoLot.units,
            item.content_amount,
            fefoLot.opened_remaining ?? null,
          )
        : getLotRemainingAmount(item.units, item.content_amount, item.opened_remaining ?? null);

    if (available < required) {
      shortages.push({
        item_id: itemId,
        item_name: item?.name ?? itemId,
        required,
        available,
        unit: item?.content_unit ?? "",
      });
    }
  }

  return { ok: shortages.length === 0, shortages };
};

export interface RecipeExpiryScore {
  recipe: RecipeWithItems;
  /** レシピの構成アイテムのうち、期限切れ/期限間近（`getExpiryStatus`）のものの件数 */
  matchingExpiringCount: number;
}

/**
 * 空き枠向けレコメンド（#715 meal-plan.md「空き枠のレコメンド」節）: ユーザーが
 * 既に登録している `recipes` を、期限切れ/期限間近のアイテムをどれだけ含むかで
 * スコアリングし、降順に並べる。外部 API 呼び出しを伴わない純粋関数。
 *
 * スコア0（該当アイテムなし）のレシピは結果から除外する — 「一致するレシピが
 * 無い」ケースを呼び出し側が `length === 0` だけで判定できるようにするため。
 * 構成アイテムを持たないレシピ（`items.length === 0`）も同様に除外される。
 *
 * `units > 0` のアイテムのみを対象とする（`WeeklyMealPlanner` の `urgentItems`
 * フィルタと同じ基準）。ロットを経由しない直接消費フォールバック
 * （`useConsumeItem.ts`）で在庫が0になったアイテムは `expiry_date` が
 * 更新されないまま残ることがあり、`units` を見ずに期限日だけで判定すると
 * 在庫が無いアイテムを含むレシピを「一致するレシピ」として誤って
 * レコメンドしてしまう。
 */
export const rankRecipesByExpiringStock = (
  recipes: readonly RecipeWithItems[],
  itemsById: Record<string, Pick<Item, "expiry_date" | "units"> | undefined>,
  warningDays?: number,
): RecipeExpiryScore[] => {
  return recipes
    .map((recipe) => {
      const matchingExpiringCount = recipe.items.filter((recipeItem) => {
        const item = itemsById[recipeItem.item_id];
        if (!item || item.units <= 0) return false;
        const status = getExpiryStatus(item.expiry_date, warningDays);
        return status === "expired" || status === "expiring-soon";
      }).length;
      return { recipe, matchingExpiringCount };
    })
    .filter((score) => score.matchingExpiringCount > 0)
    .sort((a, b) => b.matchingExpiringCount - a.matchingExpiringCount);
};
