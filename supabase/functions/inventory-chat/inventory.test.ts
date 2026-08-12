import assert from "node:assert/strict";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { fetchRecentlyConsumedItems } from "./inventory.ts";

interface ConsumptionLogRow {
  item_id: string;
  occurred_at: string;
  items: {
    name: string;
    units: number;
    opened_remaining: number | null;
    deleted_at: string | null;
  } | null;
}

// Minimal stand-in for the subset of SupabaseClient used by
// fetchRecentlyConsumedItems (a single chained select ending in `.range()`),
// so the query-shaping/filtering logic can be exercised without a live database.
const makeFakeClient = (rows: ConsumptionLogRow[]): SupabaseClient =>
  ({
    from: () => ({
      select: () => ({
        gte: () => ({
          order: () => ({
            order: () => ({
              range: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

const makeRow = (overrides: Partial<ConsumptionLogRow> = {}): ConsumptionLogRow => ({
  item_id: "item-1",
  occurred_at: "2026-08-01T00:00:00.000Z",
  items: { name: "醤油", units: 0, opened_remaining: null, deleted_at: null },
  ...overrides,
});

Deno.test("fetchRecentlyConsumedItems - includes an item with units=0 and no opened remainder", async () => {
  const supabase = makeFakeClient([makeRow()]);
  const result = await fetchRecentlyConsumedItems(supabase);
  assert.deepStrictEqual(result, [
    { item_id: "item-1", item_name: "醤油", last_consumed_at: "2026-08-01T00:00:00.000Z" },
  ]);
});

Deno.test("fetchRecentlyConsumedItems - includes a soft-deleted item regardless of remaining stock", async () => {
  const supabase = makeFakeClient([
    makeRow({
      items: {
        name: "牛乳",
        units: 0,
        opened_remaining: 200,
        deleted_at: "2026-08-01T00:00:00.000Z",
      },
    }),
  ]);
  const result = await fetchRecentlyConsumedItems(supabase);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]?.item_name, "牛乳");
});

Deno.test("fetchRecentlyConsumedItems - excludes an item that is units=0 but still has an opened remainder", async () => {
  // #829: units=0 (the sealed package is gone) but opened_remaining>0 (an
  // opened lot is still in progress) means the item is still in stock per
  // src/types/item.ts's isAlreadyInStock, so it must not be reported as
  // "recently consumed" alongside being listed as in-stock.
  const supabase = makeFakeClient([
    makeRow({ items: { name: "醤油", units: 0, opened_remaining: 150, deleted_at: null } }),
  ]);
  const result = await fetchRecentlyConsumedItems(supabase);
  assert.deepStrictEqual(result, []);
});

Deno.test("fetchRecentlyConsumedItems - excludes an item that still has whole units in stock", async () => {
  const supabase = makeFakeClient([
    makeRow({ items: { name: "米", units: 2, opened_remaining: null, deleted_at: null } }),
  ]);
  const result = await fetchRecentlyConsumedItems(supabase);
  assert.deepStrictEqual(result, []);
});

Deno.test("fetchRecentlyConsumedItems - dedupes to the most recent consumption per item", async () => {
  const supabase = makeFakeClient([
    makeRow({ item_id: "item-1", occurred_at: "2026-08-05T00:00:00.000Z" }),
    makeRow({ item_id: "item-1", occurred_at: "2026-08-01T00:00:00.000Z" }),
  ]);
  const result = await fetchRecentlyConsumedItems(supabase);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]?.last_consumed_at, "2026-08-05T00:00:00.000Z");
});

Deno.test("fetchRecentlyConsumedItems - skips rows whose joined item is missing", async () => {
  const supabase = makeFakeClient([makeRow({ items: null })]);
  const result = await fetchRecentlyConsumedItems(supabase);
  assert.deepStrictEqual(result, []);
});
