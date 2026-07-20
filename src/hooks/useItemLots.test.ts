import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: null, error: null };

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
    not: chainMethod("not"),
    or: chainMethod("or"),
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

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { consumeLot, syncItemAggregate } = await import("@/hooks/useItemLots");
const { ConcurrentUpdateError } = await import("@/lib/requireOnline");

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("consumeLot", () => {
  const baseLot = {
    id: "lot-1",
    user_id: "user-1",
    item_id: "item-1",
    units: 3,
    opened_remaining: null,
    purchase_date: null,
    expiry_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  const item = { content_amount: 1, content_unit: "個" };

  test("同一ロットへの更新が他リクエストと競合すると ConcurrentUpdateError を投げる (#432)", async () => {
    // The row was already changed by another request, so the conditional
    // update matches 0 rows and comes back with no data.
    responseQueues.item_lots = [{ data: null, error: null }];

    await expect(consumeLot({ lot: baseLot, item, deltaAmount: 1 })).rejects.toBeInstanceOf(
      ConcurrentUpdateError,
    );
  });

  test("成功時はunits/opened_remainingが一致する行だけを対象にupdateする", async () => {
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 2 }, error: null }, // conditional update
      // syncItemAggregate reads
      { data: [{ units: 2, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    await consumeLot({ lot: baseLot, item, deltaAmount: 1 });

    const eqCalls = callLog.filter((c) => c.table === "item_lots" && c.method === "eq");
    expect(eqCalls).toContainEqual({ table: "item_lots", method: "eq", args: ["units", 3] });
    const isCalls = callLog.filter((c) => c.table === "item_lots" && c.method === "is");
    expect(isCalls).toContainEqual({
      table: "item_lots",
      method: "is",
      args: ["opened_remaining", null],
    });
  });

  test("consumption_logsのinsertが失敗しても例外にはせず_logInsertFailedで返す (#441)", async () => {
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 2 }, error: null },
      { data: [{ units: 2, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: { message: "insert failed" } }];

    const result = await consumeLot({ lot: baseLot, item, deltaAmount: 1 });
    expect(result._logInsertFailed).toBe(true);
  });

  test("noteを渡すとconsumption_logs.noteに記録される (#418)", async () => {
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 2 }, error: null },
      { data: [{ units: 2, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    await consumeLot({ lot: baseLot, item, deltaAmount: 1, note: "料理で使用: カレーに使った" });

    const logInsert = callLog.find((c) => c.table === "consumption_logs" && c.method === "insert");
    expect(logInsert?.args[0]).toMatchObject({ note: "料理で使用: カレーに使った" });
  });

  test("noteを渡さない場合はnullとして記録される (#418)", async () => {
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 2 }, error: null },
      { data: [{ units: 2, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    await consumeLot({ lot: baseLot, item, deltaAmount: 1 });

    const logInsert = callLog.find((c) => c.table === "consumption_logs" && c.method === "insert");
    expect(logInsert?.args[0]).toMatchObject({ note: null });
  });
});

describe("syncItemAggregate", () => {
  test("複数ロットが同時に開封中でも実残量の合計を正しく反映する (#438)", async () => {
    // Two lots both opened at once: lot A has 2 sealed-equivalent units with
    // 0.3 remaining in the open one, lot B has 1 unit with 0.7 remaining.
    // Previously opened_remaining reset to null and units summed raw
    // (2+1=3), over-reporting stock as 3 instead of the true total of 2.0.
    responseQueues.item_lots = [
      {
        data: [
          { units: 2, expiry_date: "2026-08-01", opened_remaining: 0.3 },
          { units: 1, expiry_date: "2026-08-05", opened_remaining: 0.7 },
        ],
        error: null,
      },
    ];
    responseQueues.items = [{ data: { content_amount: 1 }, error: null }];

    await syncItemAggregate("item-1");

    const updateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      units: 2,
      opened_remaining: null,
      expiry_date: "2026-08-01",
    });
  });

  test("単一ロットが開封中の場合は従来通りopened_remainingを保持する", async () => {
    responseQueues.item_lots = [
      {
        data: [
          { units: 3, expiry_date: "2026-08-01", opened_remaining: null },
          { units: 2, expiry_date: "2026-08-05", opened_remaining: 0.5 },
        ],
        error: null,
      },
    ];
    responseQueues.items = [{ data: { content_amount: 1 }, error: null }];

    await syncItemAggregate("item-1");

    const updateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      units: 5,
      opened_remaining: 0.5,
    });
  });
});
