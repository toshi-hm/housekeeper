import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Item } from "@/types/item";
import type { RecipeWithItems } from "@/types/recipe";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: [], error: null };

const makeBuilder = (table: string, response: SupabaseResponse) => {
  const builder: Record<string, unknown> = {};
  const chainMethod =
    (method: string) =>
    (...args: unknown[]) => {
      callLog.push({ table, method, args });
      return builder;
    };

  Object.assign(builder, {
    select: chainMethod("select"),
    eq: chainMethod("eq"),
    is: chainMethod("is"),
    in: chainMethod("in"),
    limit: chainMethod("limit"),
    order: chainMethod("order"),
    insert: chainMethod("insert"),
    update: chainMethod("update"),
    delete: chainMethod("delete"),
    single: () => {
      callLog.push({ table, method: "single", args: [] });
      return Promise.resolve(response);
    },
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (v: SupabaseResponse) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(response).then(resolve, reject),
  });
  return builder;
};

const fromMock = mock((table: string) => {
  const queue = responseQueues[table];
  const response = queue && queue.length > 0 ? queue.shift()! : defaultResponse;
  return makeBuilder(table, response);
});

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

// NOTE: Only "@/lib/supabase" is mocked here (matches useConsumeItem.test.ts /
// useItemLots.test.ts) so that executeRecipe's delegation to the real
// consumeItem is exercised end-to-end. Mocking hook modules with mock.module
// leaks across test files in the same bun:test process, so we don't do that.
mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { executeRecipe } = await import("@/hooks/useRecipes");

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "Test Item",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 3,
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

const makeRecipe = (overrides: Partial<RecipeWithItems> = {}): RecipeWithItems => ({
  id: "recipe-1",
  user_id: "user-1",
  name: "朝のコーヒー",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items: [{ id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 1, created_at: "" }],
  ...overrides,
});

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("executeRecipe", () => {
  test("在庫が不足しており force なしの場合、何も消費せず status:blocked を返す", async () => {
    const recipe = makeRecipe({
      items: [{ id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 10, created_at: "" }],
    });
    const itemsById = {
      "item-1": makeItem({ units: 0, content_amount: 1, opened_remaining: null }),
    };

    const result = await executeRecipe({ recipe, itemsById });

    expect(result.status).toBe("blocked");
    expect(result.consumedItemIds).toEqual([]);
    expect(result.shortages).toHaveLength(1);
    expect(result.shortages[0]?.item_id).toBe("item-1");
    // Nothing was consumed. The only Supabase activity should be the
    // pre-check's own FEFO-lot lookup (`fetchFefoLotByItemId`) — never a
    // `consumeItem` call, which is distinguishable by its `.limit()` step.
    expect(callLog.every((c) => c.table === "item_lots")).toBe(true);
    expect(callLog.some((c) => c.method === "limit")).toBe(false);
  });

  test("全アイテムの在庫が足りていれば force なしでも消費を実行しstatus:executedを返す", async () => {
    const recipe = makeRecipe({
      items: [
        { id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 1, created_at: "" },
        { id: "ri-2", recipe_id: "recipe-1", item_id: "item-2", amount: 1, created_at: "" },
      ],
    });
    const itemsById = {
      "item-1": makeItem({ id: "item-1", units: 3, content_amount: 1, opened_remaining: null }),
      "item-2": makeItem({ id: "item-2", units: 2, content_amount: 1, opened_remaining: null }),
    };
    // Each item takes the "no lots" fallback path in consumeItem: item_lots
    // select (empty) -> items update -> consumption_logs insert -> items
    // re-select. Two items => two of each in order, plus one leading
    // item_lots select for executeRecipe's own FEFO pre-check
    // (fetchFefoLotByItemId, a single batched `.in()` query covering both
    // items) — also empty, so checkRecipeStock falls back to the aggregate.
    responseQueues.item_lots = [
      { data: [], error: null }, // pre-check FEFO fetch
      { data: [], error: null },
      { data: [], error: null },
    ];
    responseQueues.items = [
      { data: null, error: null }, // item-1 update
      { data: makeItem({ id: "item-1", units: 2 }), error: null }, // item-1 re-select
      { data: null, error: null }, // item-2 update
      { data: makeItem({ id: "item-2", units: 1 }), error: null }, // item-2 re-select
    ];
    responseQueues.consumption_logs = [
      { data: null, error: null },
      { data: null, error: null },
    ];

    const result = await executeRecipe({ recipe, itemsById });

    expect(result.status).toBe("executed");
    expect(result.consumedItemIds).toEqual(["item-1", "item-2"]);
    expect(result.skippedItemIds).toEqual([]);
    expect(result.failedItemIds).toEqual([]);
    // 1 pre-check select + 2 per-item consumeItem selects.
    expect(callLog.filter((c) => c.table === "item_lots" && c.method === "select")).toHaveLength(3);
  });

  test("force:true の場合、在庫が足りるアイテムだけ消費し不足分はスキップする", async () => {
    const recipe = makeRecipe({
      items: [
        { id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 1, created_at: "" }, // sufficient
        { id: "ri-2", recipe_id: "recipe-1", item_id: "item-2", amount: 5, created_at: "" }, // short
      ],
    });
    const itemsById = {
      "item-1": makeItem({ id: "item-1", units: 3, content_amount: 1, opened_remaining: null }),
      "item-2": makeItem({ id: "item-2", units: 0, content_amount: 1, opened_remaining: null }),
    };
    responseQueues.item_lots = [
      { data: [], error: null }, // pre-check FEFO fetch (covers both items)
      { data: [], error: null }, // item-1's consumeItem fetch (item-2 is skipped)
    ];
    responseQueues.items = [
      { data: null, error: null },
      { data: makeItem({ id: "item-1", units: 2 }), error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    const result = await executeRecipe({ recipe, itemsById, force: true });

    expect(result.status).toBe("executed");
    expect(result.consumedItemIds).toEqual(["item-1"]);
    expect(result.skippedItemIds).toEqual(["item-2"]);
    expect(result.failedItemIds).toEqual([]);
    // 1 pre-check select + 1 consumeItem select (only the sufficient item).
    expect(callLog.filter((c) => c.table === "item_lots" && c.method === "select")).toHaveLength(2);
  });

  test("消費処理自体が失敗したアイテムはfailedItemIdsに入り、他アイテムの処理は続行される", async () => {
    const recipe = makeRecipe({
      items: [
        { id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 1, created_at: "" },
        { id: "ri-2", recipe_id: "recipe-1", item_id: "item-2", amount: 1, created_at: "" },
      ],
    });
    const itemsById = {
      "item-1": makeItem({ id: "item-1", units: 3, content_amount: 1, opened_remaining: null }),
      "item-2": makeItem({ id: "item-2", units: 3, content_amount: 1, opened_remaining: null }),
    };
    // item-1's item_lots lookup (inside consumeItem, after the pre-check's
    // own successful FEFO fetch) errors out, causing consumeItem to throw
    // and executeRecipe to record it as failed; item-2 proceeds normally.
    responseQueues.item_lots = [
      { data: [], error: null }, // pre-check FEFO fetch (covers both items)
      { data: null, error: { message: "boom" } },
      { data: [], error: null },
    ];
    responseQueues.items = [
      { data: null, error: null },
      { data: makeItem({ id: "item-2", units: 2 }), error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    const result = await executeRecipe({ recipe, itemsById });

    expect(result.status).toBe("executed");
    expect(result.failedItemIds).toEqual(["item-1"]);
    expect(result.consumedItemIds).toEqual(["item-2"]);
  });

  test("複数ロットにまたがる在庫は集計ではなくFEFOロット基準でblockedと判定する(#393)", async () => {
    // Aggregate stock (items.units) looks sufficient (3 units), but that's
    // split across two lots and consumeItem only ever draws from the single
    // soonest-expiring (FEFO) one. The pre-check must reflect that reality
    // instead of the misleadingly-sufficient aggregate.
    const recipe = makeRecipe({
      items: [{ id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 3, created_at: "" }],
    });
    const itemsById = {
      "item-1": makeItem({ id: "item-1", units: 3, content_amount: 1, opened_remaining: null }),
    };
    // fetchFefoLotByItemId's single .in() query returns only the
    // soonest-expiring lot's row for item-1: 1 unit, not the aggregate's 3.
    responseQueues.item_lots = [{ data: [{ item_id: "item-1", units: 1 }], error: null }];

    const result = await executeRecipe({ recipe, itemsById });

    expect(result.status).toBe("blocked");
    expect(result.shortages).toEqual([
      { item_id: "item-1", item_name: "Test Item", required: 3, available: 1, unit: "個" },
    ]);
    // Blocked before ever calling consumeItem.
    expect(callLog.some((c) => c.method === "limit")).toBe(false);
  });
});
