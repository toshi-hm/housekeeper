import { describe, expect, test } from "bun:test";

import { checkRecipeStock, type RecipeStockItem } from "@/types/recipe";

const makeItem = (overrides: Partial<RecipeStockItem> = {}): RecipeStockItem => ({
  id: "item-1",
  name: "コーヒー豆",
  units: 2,
  content_amount: 100,
  content_unit: "g",
  opened_remaining: null,
  ...overrides,
});

describe("checkRecipeStock", () => {
  test("全アイテムの在庫が足りていればokになりshortagesは空", () => {
    const items = { "item-1": makeItem({ units: 2, content_amount: 100, opened_remaining: null }) };
    const result = checkRecipeStock([{ item_id: "item-1", amount: 15 }], items);
    expect(result.ok).toBe(true);
    expect(result.shortages).toEqual([]);
  });

  test("在庫が不足しているアイテムはshortagesに含まれる", () => {
    const items = {
      "item-1": makeItem({ units: 0, content_amount: 100, opened_remaining: 5 }),
    };
    const result = checkRecipeStock([{ item_id: "item-1", amount: 15 }], items);
    expect(result.ok).toBe(false);
    expect(result.shortages).toEqual([
      { item_id: "item-1", item_name: "コーヒー豆", required: 15, available: 5, unit: "g" },
    ]);
  });

  test("開封中の残量を含めた実残量で判定する(getLotRemainingAmountを利用)", () => {
    // units=1 (開封中の1個) + opened_remaining=10 → 実残量は10のみ (未開封分なし)
    const items = {
      "item-1": makeItem({ units: 1, content_amount: 100, opened_remaining: 10 }),
    };
    const result = checkRecipeStock([{ item_id: "item-1", amount: 15 }], items);
    expect(result.ok).toBe(false);
    expect(result.shortages[0]?.available).toBe(10);
  });

  test("アイテムが見つからない場合は在庫0として扱いshortagesに含める", () => {
    const result = checkRecipeStock([{ item_id: "missing-item", amount: 1 }], {});
    expect(result.ok).toBe(false);
    expect(result.shortages).toEqual([
      { item_id: "missing-item", item_name: "missing-item", required: 1, available: 0, unit: "" },
    ]);
  });

  test("複数アイテムのうち一部だけ不足している場合、不足分だけがshortagesに入る", () => {
    const items = {
      "item-1": makeItem({ id: "item-1", units: 2, content_amount: 100, opened_remaining: null }), // 200g available
      "item-2": makeItem({
        id: "item-2",
        name: "フィルター",
        units: 0,
        content_amount: 1,
        content_unit: "個",
        opened_remaining: null,
      }), // 0 available
    };
    const result = checkRecipeStock(
      [
        { item_id: "item-1", amount: 15 },
        { item_id: "item-2", amount: 1 },
      ],
      items,
    );
    expect(result.ok).toBe(false);
    expect(result.shortages).toHaveLength(1);
    expect(result.shortages[0]?.item_id).toBe("item-2");
  });
});
