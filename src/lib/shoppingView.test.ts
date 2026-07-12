import { describe, expect, test } from "bun:test";

import {
  type CategoryResolver,
  groupShoppingItemsByCategory,
  isShoppingSortKey,
  type ResolvedCategory,
  sortShoppingItems,
} from "@/lib/shoppingView";
import type { ShoppingItem } from "@/types/shopping";

const makeItem = (overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: "s-1",
  user_id: "u-1",
  name: "アイテム",
  desired_units: 1,
  note: null,
  linked_item_id: null,
  status: "planned",
  purchased_at: null,
  created_item_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  ...overrides,
});

const categories: Record<string, ResolvedCategory> = {
  food: { id: "food", name: "食品", color: "#22c55e" },
  daily: { id: "daily", name: "日用品", color: "#3b82f6" },
};

const resolver: CategoryResolver = (item) =>
  item.linked_item_id ? (categories[item.linked_item_id] ?? null) : null;

describe("isShoppingSortKey", () => {
  test("有効なキーを判定する", () => {
    expect(isShoppingSortKey("category")).toBe(true);
    expect(isShoppingSortKey("invalid")).toBe(false);
  });
});

describe("sortShoppingItems", () => {
  test("name: 五十音順に並ぶ", () => {
    const items = [makeItem({ id: "a", name: "りんご" }), makeItem({ id: "b", name: "あんず" })];
    const sorted = sortShoppingItems(items, "name", resolver);
    expect(sorted.map((i) => i.name)).toEqual(["あんず", "りんご"]);
  });

  test("priority: desired_units が多い順に並ぶ", () => {
    const items = [
      makeItem({ id: "a", desired_units: 1 }),
      makeItem({ id: "b", desired_units: 5 }),
    ];
    const sorted = sortShoppingItems(items, "priority", resolver);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a"]);
  });

  test("added: 元の順序を維持する", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const sorted = sortShoppingItems(items, "added", resolver);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b"]);
  });

  test("category: カテゴリ名順、未分類は末尾", () => {
    const items = [
      makeItem({ id: "x", linked_item_id: null }),
      makeItem({ id: "d", linked_item_id: "daily" }),
      makeItem({ id: "f", linked_item_id: "food" }),
    ];
    const sorted = sortShoppingItems(items, "category", resolver);
    // 食品 < 日用品 < 未分類
    expect(sorted.map((i) => i.id)).toEqual(["f", "d", "x"]);
  });
});

describe("groupShoppingItemsByCategory", () => {
  test("カテゴリ別にグループ化し、未分類を末尾にする", () => {
    const items = [
      makeItem({ id: "x", name: "メモ", linked_item_id: null }),
      makeItem({ id: "f1", name: "牛乳", linked_item_id: "food" }),
      makeItem({ id: "d1", name: "洗剤", linked_item_id: "daily" }),
      makeItem({ id: "f2", name: "卵", linked_item_id: "food" }),
    ];
    const groups = groupShoppingItemsByCategory(items, resolver);
    expect(groups.map((g) => g.categoryName)).toEqual(["食品", "日用品", null]);
    const food = groups[0];
    expect(food?.items.map((i) => i.name)).toEqual(["牛乳", "卵"]); // グループ内も名前順
    expect(food?.color).toBe("#22c55e");
    expect(groups[2]?.items.map((i) => i.id)).toEqual(["x"]);
  });
});
