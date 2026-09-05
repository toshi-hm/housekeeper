import type { CheapestStoreHint } from "@/components/molecules/ShoppingRow";
import type { ShoppingItem } from "@/types/shopping";

/** 買い物中モードの見込み合計金額（#982）の算出結果。 */
export interface ShoppingModeEstimatedTotal {
  /** 最安値ベースで合算した見込み合計金額。 */
  total: number;
  /** 合計に含めた（＝比較データがあった）アイテム数。0件なら表示側は非表示にする。 */
  matchedCount: number;
  /** 比較データが無く合計から除外したアイテムが1件でもあるか。 */
  hasExcludedItems: boolean;
}

/**
 * 買い物リストの未購入アイテム（`plannedItems`）のうち、`resolveCheapestStore` が
 * 値を返すもの（＝店舗価格比較データがあるもの）だけを最安値ベースで合算する（#982）。
 * 比較データが無いアイテムは合計に含めず、`hasExcludedItems` で呼び出し側に知らせる。
 */
export const calculateShoppingModeEstimatedTotal = (
  items: readonly ShoppingItem[],
  resolveCheapestStore: (item: ShoppingItem) => CheapestStoreHint | null,
): ShoppingModeEstimatedTotal => {
  let total = 0;
  let matchedCount = 0;
  let hasExcludedItems = false;

  for (const item of items) {
    const hint = resolveCheapestStore(item);
    if (!hint) {
      hasExcludedItems = true;
      continue;
    }
    total += hint.unitPrice * item.desired_units;
    matchedCount += 1;
  }

  return { total, matchedCount, hasExcludedItems };
};
