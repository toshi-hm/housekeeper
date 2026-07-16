import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Item } from "@/types/item";

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

// NOTE: Only "@/lib/supabase" is mocked here (not "@/hooks/useItemLots") so
// that consumeItem's delegation to the real consumeLot is exercised. Mocking
// a hook module globally with mock.module leaks across test files sharing
// the same process (bun:test's module registry is process-wide), which would
// otherwise corrupt useItemLots.test.ts's own import of the real consumeLot.
mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { consumeItem } = await import("@/hooks/useConsumeItem");

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

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("consumeItem", () => {
  test("作成日順(FIFO)ではなく期限日昇順(FEFO)でロットを取得する (#446)", async () => {
    // No lots found → falls back to the items-direct path, but the
    // FEFO order() calls on the item_lots query already happened by then.
    responseQueues.item_lots = [{ data: [], error: null }];
    responseQueues.items = [{ data: makeItem(), error: null }];

    await consumeItem({ item: makeItem(), deltaAmount: 1 });

    const orderCalls = callLog.filter((c) => c.table === "item_lots" && c.method === "order");
    expect(orderCalls[0]?.args).toEqual(["expiry_date", { ascending: true, nullsFirst: false }]);
    expect(orderCalls[1]?.args).toEqual(["created_at", { ascending: true }]);
  });

  test("ロットが存在する場合は最も期限が近いロットに対してconsumeLotの消費処理が行われる", async () => {
    const targetLot = {
      id: "lot-earliest-expiry",
      user_id: "user-1",
      item_id: "item-1",
      units: 2,
      opened_remaining: null,
      purchase_date: null,
      expiry_date: "2026-02-01",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    responseQueues.item_lots = [
      { data: [targetLot], error: null }, // FEFO select in consumeItem
      { data: { ...targetLot, units: 1 }, error: null }, // consumeLot's conditional update
      { data: [{ units: 1, expiry_date: null, opened_remaining: null }], error: null }, // syncItemAggregate
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: makeItem({ units: 1 }), error: null }, // final re-select in consumeItem
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    const result = await consumeItem({ item: makeItem(), deltaAmount: 1 });

    const logInsert = callLog.find((c) => c.table === "consumption_logs" && c.method === "insert");
    expect(logInsert?.args[0]).toMatchObject({
      item_id: "item-1",
      units_before: 2,
      units_after: 1,
    });
    expect(result._logInsertFailed).toBe(false);
  });

  test("ロットが存在しない場合、consumption_logsのinsert失敗を_logInsertFailedとして返す (#441)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];
    responseQueues.consumption_logs = [{ data: null, error: { message: "insert failed" } }];
    responseQueues.items = [{ data: makeItem({ units: 2 }), error: null }];

    const result = await consumeItem({ item: makeItem(), deltaAmount: 1 });
    expect(result._logInsertFailed).toBe(true);
  });
});
