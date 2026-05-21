import { describe, expect, test } from "bun:test";

import { normalizeUpdateValues } from "@/hooks/useItems";
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

  test("empty list → returns incoming item", () => {
    const incoming = makeItem({ id: "new-item" });
    const result = upsertItemInListCache([], incoming);
    expect(result).toEqual([incoming]);
  });

  test("created_at sort keeps newest item first when inserting", () => {
    const existing = makeItem({ id: "existing-item", created_at: "2026-01-01T00:00:00Z" });
    const incoming = makeItem({ id: "new-item", created_at: "2026-01-02T00:00:00Z" });
    const result = upsertItemInListCache([existing], incoming, "created_at");
    expect(result).toEqual([incoming, existing]);
  });

  test("expiry_date sort reorders updated item ascending with nulls last", () => {
    const milk = makeItem({ id: "milk", expiry_date: "2026-01-05" });
    const bread = makeItem({ id: "bread", expiry_date: "2026-01-10" });
    const updatedBread = makeItem({ id: "bread", expiry_date: "2026-01-03" });
    const result = upsertItemInListCache([milk, bread], updatedBread, "expiry_date");
    expect(result).toEqual([updatedBread, milk]);
  });

  test("purchase_date sort reorders updated item descending", () => {
    const older = makeItem({ id: "older", purchase_date: "2026-01-01" });
    const newer = makeItem({ id: "newer", purchase_date: "2026-01-03" });
    const updatedOlder = makeItem({ id: "older", purchase_date: "2026-01-04" });
    const result = upsertItemInListCache([newer, older], updatedOlder, "purchase_date");
    expect(result).toEqual([updatedOlder, newer]);
  });

  test("item already in list → updates without duplication", () => {
    const old = makeItem({ id: "item-1", name: "Old Name" });
    const updated = makeItem({ id: "item-1", name: "New Name" });
    const result = upsertItemInListCache([old], updated);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.name).toBe("New Name");
  });

  test("does not mutate the original array", () => {
    const original = [makeItem({ id: "item-1" })];
    const originalRef = original;
    upsertItemInListCache(original, makeItem({ id: "new-item" }));
    expect(original).toBe(originalRef);
    expect(original).toHaveLength(1);
  });
});

describe("normalizeUpdateValues", () => {
  test("omits undefined fields to keep updates partial", () => {
    const result = normalizeUpdateValues({ name: "Updated name" });
    expect(result).toEqual({ name: "Updated name" });
    expect("units" in result).toBe(false);
    expect("content_amount" in result).toBe(false);
    expect("barcode" in result).toBe(false);
  });

  test("converts explicit empty strings to null for nullable text fields", () => {
    const result = normalizeUpdateValues({
      barcode: "",
      purchase_date: "",
      expiry_date: "",
      notes: "",
      image_path: "",
    });

    expect(result).toEqual({
      barcode: null,
      purchase_date: null,
      expiry_date: null,
      notes: null,
      image_path: null,
    });
  });

  test("keeps explicit null for opened_remaining", () => {
    const result = normalizeUpdateValues({ opened_remaining: null });
    expect(result).toEqual({ opened_remaining: null });
  });

  test("treats present undefined on nullable fields as clear (null)", () => {
    const result = normalizeUpdateValues({
      barcode: undefined,
      category_id: undefined,
      storage_location_id: undefined,
      purchase_date: undefined,
      expiry_date: undefined,
      notes: undefined,
      image_path: undefined,
    });

    expect(result).toEqual({
      barcode: null,
      category_id: null,
      storage_location_id: null,
      purchase_date: null,
      expiry_date: null,
      notes: null,
      image_path: null,
    });
  });
});
