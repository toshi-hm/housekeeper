import { describe, expect, test } from "bun:test";

import { upsertItemInListCache } from "@/lib/itemCache";
import type { Item } from "@/types/item";

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "Test Item",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  notes: null,
  image_path: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("upsertItemInListCache", () => {
  test("undefined cache → returns undefined (no change)", () => {
    const result = upsertItemInListCache(undefined, makeItem());
    expect(result).toBeUndefined();
  });

  test("non-array cache (single Item object) → returns undefined without error", () => {
    const singleItem = makeItem({ id: "other-item" });
    // Simulates the case where a per-item query cache (Item, not Item[]) is hit
    // by setQueriesData({ queryKey: ITEMS_KEY })
    const result = upsertItemInListCache(singleItem, makeItem());
    expect(result).toBeUndefined();
  });

  test("empty list → prepends incoming item", () => {
    const incoming = makeItem({ id: "new-item" });
    const result = upsertItemInListCache([], incoming);
    expect(result).toEqual([incoming]);
  });

  test("item not in list → prepends at head", () => {
    const existing = makeItem({ id: "existing-item" });
    const incoming = makeItem({ id: "new-item" });
    const result = upsertItemInListCache([existing], incoming);
    expect(result).toEqual([incoming, existing]);
  });

  test("item already in list → updates in-place (does not duplicate)", () => {
    const old = makeItem({ id: "item-1", name: "Old Name" });
    const updated = makeItem({ id: "item-1", name: "New Name" });
    const result = upsertItemInListCache([old], updated);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.name).toBe("New Name");
  });

  test("item in middle of list → updates correct entry, preserves order", () => {
    const a = makeItem({ id: "a" });
    const b = makeItem({ id: "b", name: "Old B" });
    const c = makeItem({ id: "c" });
    const updatedB = makeItem({ id: "b", name: "New B" });
    const result = upsertItemInListCache([a, b, c], updatedB);
    expect(result).toHaveLength(3);
    expect(result?.[0]?.id).toBe("a");
    expect(result?.[1]?.name).toBe("New B");
    expect(result?.[2]?.id).toBe("c");
  });

  test("does not mutate the original array", () => {
    const original = [makeItem({ id: "item-1" })];
    const originalRef = original;
    upsertItemInListCache(original, makeItem({ id: "new-item" }));
    expect(original).toBe(originalRef);
    expect(original).toHaveLength(1);
  });
});
