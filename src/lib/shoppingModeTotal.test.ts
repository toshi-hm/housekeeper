import { describe, expect, it } from "bun:test";

import type { CheapestStoreHint } from "@/components/molecules/ShoppingRow";
import type { ShoppingItem } from "@/types/shopping";

import { calculateShoppingModeEstimatedTotal } from "./shoppingModeTotal";

const makeItem = (overrides: Partial<ShoppingItem> & Pick<ShoppingItem, "id">): ShoppingItem => ({
  id: overrides.id,
  user_id: "u1",
  name: "item",
  desired_units: 1,
  note: null,
  linked_item_id: null,
  auto_added: false,
  status: "planned",
  purchased_at: null,
  created_item_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

describe("calculateShoppingModeEstimatedTotal", () => {
  it("returns a zero total with no excluded items for an empty list", () => {
    const result = calculateShoppingModeEstimatedTotal([], () => null);
    expect(result).toEqual({ total: 0, matchedCount: 0, hasExcludedItems: false });
  });

  it("sums unit price × desired units for items with comparison data", () => {
    const items = [
      makeItem({ id: "s1", desired_units: 2 }),
      makeItem({ id: "s2", desired_units: 1 }),
    ];
    const hints: Record<string, CheapestStoreHint> = {
      s1: { storeName: "〇〇スーパー", unitPrice: 100 },
      s2: { storeName: "△△マート", unitPrice: 50 },
    };
    const result = calculateShoppingModeEstimatedTotal(items, (item) => hints[item.id] ?? null);
    expect(result).toEqual({ total: 250, matchedCount: 2, hasExcludedItems: false });
  });

  it("excludes items without comparison data from the total and flags them", () => {
    const items = [
      makeItem({ id: "s1", desired_units: 2 }),
      makeItem({ id: "s2", desired_units: 3 }),
    ];
    const result = calculateShoppingModeEstimatedTotal(items, (item) =>
      item.id === "s1" ? { storeName: "〇〇スーパー", unitPrice: 100 } : null,
    );
    expect(result).toEqual({ total: 200, matchedCount: 1, hasExcludedItems: true });
  });

  it("reports every item excluded when resolveCheapestStore never matches", () => {
    const items = [makeItem({ id: "s1" }), makeItem({ id: "s2" })];
    const result = calculateShoppingModeEstimatedTotal(items, () => null);
    expect(result).toEqual({ total: 0, matchedCount: 0, hasExcludedItems: true });
  });
});
