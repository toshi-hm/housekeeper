import { describe, expect, test } from "bun:test";

import {
  checkRecipeStock,
  rankRecipesByExpiringStock,
  type RecipeStockItem,
  type RecipeWithItems,
} from "@/types/recipe";

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

  test("同一アイテムが複数行にまたがる場合、必要量を合算してから在庫と比較する (#765)", () => {
    // 在庫1個のアイテムを2行に分けて各1個ずつ要求すると、行ごとの独立判定なら
    // どちらも「1個必要・1個ある→OK」に見えてしまうが、合計では2個必要で不足している。
    const items = { "item-1": makeItem({ units: 1, content_amount: 1, opened_remaining: null }) };
    const result = checkRecipeStock(
      [
        { item_id: "item-1", amount: 1 },
        { item_id: "item-1", amount: 1 },
      ],
      items,
    );
    expect(result.ok).toBe(false);
    expect(result.shortages).toEqual([
      { item_id: "item-1", item_name: "コーヒー豆", required: 2, available: 1, unit: "g" },
    ]);
  });

  test("同一アイテムが複数行でも合算した在庫が足りていればokになる", () => {
    const items = { "item-1": makeItem({ units: 3, content_amount: 1, opened_remaining: null }) };
    const result = checkRecipeStock(
      [
        { item_id: "item-1", amount: 1 },
        { item_id: "item-1", amount: 2 },
      ],
      items,
    );
    expect(result.ok).toBe(true);
    expect(result.shortages).toEqual([]);
  });

  describe("fefoLotByItemId (multi-lot items, #393)", () => {
    // executeRecipe only ever consumes from a single lot (the FEFO one), so
    // the pre-check must be based on that lot's remaining amount, not the
    // aggregate `items.units` across all lots — otherwise a recipe could be
    // reported as "sufficient" and then fail during actual consumption.
    test("uses the FEFO lot's amount, not the aggregate, when fefoLotByItemId is provided", () => {
      // Aggregate stock is 300g across lots, but the soonest-expiring lot
      // only has 50g — insufficient for a 100g requirement despite the
      // aggregate looking fine.
      const items = {
        "item-1": makeItem({ units: 3, content_amount: 100, opened_remaining: null }),
      };
      const fefoLots = { "item-1": { units: 0, opened_remaining: 50 } };
      const result = checkRecipeStock([{ item_id: "item-1", amount: 100 }], items, fefoLots);
      expect(result.ok).toBe(false);
      expect(result.shortages).toEqual([
        { item_id: "item-1", item_name: "コーヒー豆", required: 100, available: 50, unit: "g" },
      ]);
    });

    test("passes when the FEFO lot alone has enough, even if it isn't the largest lot", () => {
      const items = {
        "item-1": makeItem({ units: 3, content_amount: 100, opened_remaining: null }),
      };
      const fefoLots = { "item-1": { units: 2, opened_remaining: null } };
      const result = checkRecipeStock([{ item_id: "item-1", amount: 150 }], items, fefoLots);
      expect(result.ok).toBe(true);
    });

    test("falls back to the aggregate when no FEFO lot is given for an item (no-lots consumeItem path)", () => {
      const items = {
        "item-1": makeItem({ units: 2, content_amount: 100, opened_remaining: null }),
      };
      const result = checkRecipeStock([{ item_id: "item-1", amount: 150 }], items, {});
      expect(result.ok).toBe(true);
    });
  });
});

describe("rankRecipesByExpiringStock", () => {
  const makeRecipe = (overrides: Partial<RecipeWithItems> = {}): RecipeWithItems => ({
    id: "recipe-1",
    user_id: "user-1",
    name: "レシピ",
    created_at: "",
    updated_at: "",
    items: [],
    ...overrides,
  });

  test("期限切れ/期限間近アイテムを含むレシピを一致件数の降順で返す", () => {
    const recipes = [
      makeRecipe({
        id: "r1",
        name: "1件一致",
        items: [{ id: "ri1", recipe_id: "r1", item_id: "expired-1", amount: 1, created_at: "" }],
      }),
      makeRecipe({
        id: "r2",
        name: "2件一致",
        items: [
          { id: "ri2", recipe_id: "r2", item_id: "expired-1", amount: 1, created_at: "" },
          { id: "ri3", recipe_id: "r2", item_id: "expiring-1", amount: 1, created_at: "" },
        ],
      }),
    ];
    const itemsById = {
      "expired-1": { expiry_date: "2020-01-01" },
      "expiring-1": { expiry_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
    };

    const result = rankRecipesByExpiringStock(recipes, itemsById);

    expect(result.map((r) => r.recipe.id)).toEqual(["r2", "r1"]);
    expect(result[0]?.matchingExpiringCount).toBe(2);
    expect(result[1]?.matchingExpiringCount).toBe(1);
  });

  test("該当アイテムが無いレシピ(スコア0)は結果から除外する", () => {
    const recipes = [
      makeRecipe({
        id: "r1",
        items: [{ id: "ri1", recipe_id: "r1", item_id: "ok-1", amount: 1, created_at: "" }],
      }),
    ];
    const itemsById = { "ok-1": { expiry_date: "2099-01-01" } };

    expect(rankRecipesByExpiringStock(recipes, itemsById)).toEqual([]);
  });

  test("構成アイテムが無いレシピは除外する", () => {
    const recipes = [makeRecipe({ id: "r1", items: [] })];
    expect(rankRecipesByExpiringStock(recipes, {})).toEqual([]);
  });

  test("アイテムが見つからない(削除済み等)場合はそのアイテムを一致に数えない", () => {
    const recipes = [
      makeRecipe({
        id: "r1",
        items: [{ id: "ri1", recipe_id: "r1", item_id: "missing", amount: 1, created_at: "" }],
      }),
    ];
    expect(rankRecipesByExpiringStock(recipes, {})).toEqual([]);
  });
});
