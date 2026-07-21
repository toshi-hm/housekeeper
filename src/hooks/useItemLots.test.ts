import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import { computeConsumption } from "@/types/item";

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

const { consumeLot, createLot, syncItemAggregate, useUpdateLot } =
  await import("@/hooks/useItemLots");
const { ConcurrentUpdateError } = await import("@/lib/requireOnline");
const { ToastContext } = await import("@/lib/toast-context");

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const stubToast = { toasts: [], toast: () => {}, dismiss: () => {} };
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ToastContext, { value: stubToast }, children),
    );
};

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

  test("auto_reorder が有効で消費後にしきい値以下になると shopping_list_items へ自動追加する (#353)", async () => {
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 0 }, error: null }, // conditional update
      { data: [{ units: 0, expiry_date: null, opened_remaining: null }], error: null }, // syncItemAggregate read
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate read
      { data: null, error: null }, // syncItemAggregate update
      // maybeAutoReorder read
      {
        data: {
          id: "item-1",
          user_id: "user-1",
          name: "牛乳",
          units: 0,
          auto_reorder: true,
          reorder_threshold: null,
        },
        error: null,
      },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];
    responseQueues.shopping_list_items = [
      { data: null, error: null }, // dedup check: no existing planned row
      { data: null, error: null }, // insert
    ];

    await consumeLot({ lot: { ...baseLot, units: 1 }, item, deltaAmount: 1 });

    const insertCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "insert",
    );
    expect(insertCall?.args[0]).toMatchObject({
      user_id: "user-1",
      name: "牛乳",
      desired_units: 1,
      linked_item_id: "item-1",
    });
  });

  test("auto_reorder が無効なアイテムは消費後も shopping_list_items へ追加しない", async () => {
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 0 }, error: null },
      { data: [{ units: 0, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
      {
        data: {
          id: "item-1",
          user_id: "user-1",
          name: "牛乳",
          units: 0,
          auto_reorder: false,
          reorder_threshold: null,
        },
        error: null,
      },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    await consumeLot({ lot: { ...baseLot, units: 1 }, item, deltaAmount: 1 });

    expect(callLog.some((c) => c.table === "shopping_list_items")).toBe(false);
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

  test("通常消費: 未開封ロットを1個分消費するとunitsが1だけデクリメントされる", async () => {
    // baseLot has units=3, content_amount=1 → consuming 1 whole unit should
    // simply decrement units by one, with opened_remaining staying null.
    responseQueues.item_lots = [
      { data: { ...baseLot, units: 2 }, error: null }, // conditional update
      { data: [{ units: 2, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    const expected = computeConsumption(
      { units: baseLot.units, content_amount: 1, content_unit: "個", opened_remaining: null },
      1,
    );
    expect(expected.units_after).toBe(2);
    expect(expected.opened_remaining_after).toBeNull();

    await consumeLot({ lot: baseLot, item, deltaAmount: 1 });

    const updateCall = callLog.find((c) => c.table === "item_lots" && c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      units: expected.units_after,
      opened_remaining: expected.opened_remaining_after,
    });

    const logInsert = callLog.find((c) => c.table === "consumption_logs" && c.method === "insert");
    expect(logInsert?.args[0]).toMatchObject({
      units_before: 3,
      units_after: 2,
      opened_remaining_before: null,
      opened_remaining_after: null,
    });
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

  test("開封中ロットのopened_remainingを跨いで消費すると新たな開封が発生しunits/opened_remainingが更新される", async () => {
    // Lot: 2 sealed-equivalent units, one already opened with 0.3 remaining
    // (content_amount = 1). Consuming 0.5 exceeds the currently-open
    // package's remainder, so it must break open the next sealed unit.
    const openLot = { ...baseLot, units: 2, opened_remaining: 0.3 };
    const openItem = { content_amount: 1, content_unit: "個" };

    const expected = computeConsumption(
      { units: openLot.units, content_amount: 1, content_unit: "個", opened_remaining: 0.3 },
      0.5,
    );
    // totalBefore = (2-1)*1 + 0.3 = 1.3; totalAfter = 0.8 → sealedUnits=0, openedAfter=0.8
    expect(expected.units_after).toBe(1);
    expect(expected.opened_remaining_after).toBeCloseTo(0.8);

    responseQueues.item_lots = [
      {
        data: {
          ...openLot,
          units: expected.units_after,
          opened_remaining: expected.opened_remaining_after,
        },
        error: null,
      },
      { data: [{ units: 1, expiry_date: null, opened_remaining: 0.8 }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];

    await consumeLot({ lot: openLot, item: openItem, deltaAmount: 0.5 });

    const updateCall = callLog.find((c) => c.table === "item_lots" && c.method === "update");
    const updateArgs = updateCall?.args[0] as { units: number; opened_remaining: number };
    expect(updateArgs.units).toBe(1);
    expect(updateArgs.opened_remaining).toBeCloseTo(0.8);

    // Optimistic-concurrency guard must key off the pre-consumption
    // opened_remaining (0.3), not the post-consumption value.
    const eqCalls = callLog.filter((c) => c.table === "item_lots" && c.method === "eq");
    expect(eqCalls).toContainEqual({
      table: "item_lots",
      method: "eq",
      args: ["opened_remaining", 0.3],
    });
  });
});

describe("createLot", () => {
  test("必須フィールドのみ指定した場合、任意フィールドはnullで補完してinsertする", async () => {
    responseQueues.item_lots = [
      {
        data: {
          id: "lot-new",
          user_id: "user-1",
          item_id: "item-1",
          units: 2,
          opened_remaining: null,
          purchase_date: null,
          expiry_date: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        error: null,
      },
    ];

    const result = await createLot("user-1", "item-1", { units: 2 });

    const insertCall = callLog.find((c) => c.table === "item_lots" && c.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      user_id: "user-1",
      item_id: "item-1",
      units: 2,
      opened_remaining: null,
      unit_price: null,
      purchase_date: null,
      expiry_date: null,
    });
    expect(result.id).toBe("lot-new");
  });

  test("opened_remaining/purchase_date/expiry_dateを指定した場合はそのままinsertする", async () => {
    responseQueues.item_lots = [
      {
        data: {
          id: "lot-new",
          user_id: "user-1",
          item_id: "item-1",
          units: 1,
          opened_remaining: 0.5,
          purchase_date: "2026-01-01",
          expiry_date: "2026-02-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        error: null,
      },
    ];

    await createLot("user-1", "item-1", {
      units: 1,
      opened_remaining: 0.5,
      purchase_date: "2026-01-01",
      expiry_date: "2026-02-01",
    });

    const insertCall = callLog.find((c) => c.table === "item_lots" && c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      opened_remaining: 0.5,
      purchase_date: "2026-01-01",
      expiry_date: "2026-02-01",
    });
  });

  test("insertがエラーを返した場合はそのままthrowする", async () => {
    responseQueues.item_lots = [{ data: null, error: { message: "insert failed" } }];
    await expect(createLot("user-1", "item-1", { units: 1 })).rejects.toMatchObject({
      message: "insert failed",
    });
  });
});

describe("useUpdateLot", () => {
  test("成功時、更新値をitem_lotsに反映しsyncItemAggregateでitemsも再集計する", async () => {
    responseQueues.item_lots = [
      {
        data: {
          id: "lot-1",
          user_id: "user-1",
          item_id: "item-1",
          units: 5,
          opened_remaining: null,
          purchase_date: null,
          expiry_date: "2026-03-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        error: null,
      }, // updateLot's .update().select().single()
      { data: [{ units: 5, expiry_date: "2026-03-01", opened_remaining: null }], error: null }, // syncItemAggregate lots read
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate item read
      { data: null, error: null }, // syncItemAggregate update
    ];

    const { result } = renderHook(() => useUpdateLot(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        lotId: "lot-1",
        itemId: "item-1",
        values: { units: 5, expiry_date: "2026-03-01" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const updateCall = callLog.find((c) => c.table === "item_lots" && c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ units: 5, expiry_date: "2026-03-01" });

    const lotEqCalls = callLog.filter((c) => c.table === "item_lots" && c.method === "eq");
    expect(lotEqCalls).toContainEqual({
      table: "item_lots",
      method: "eq",
      args: ["id", "lot-1"],
    });
    expect(lotEqCalls).toContainEqual({
      table: "item_lots",
      method: "eq",
      args: ["item_id", "item-1"],
    });

    // syncItemAggregate must run after the lot update so the item's
    // aggregate units/expiry stay in sync with the edited lot.
    const itemsUpdateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(itemsUpdateCall).toBeDefined();
    expect(itemsUpdateCall?.args[0]).toMatchObject({ units: 5, expiry_date: "2026-03-01" });
    expect(callLog).toContainEqual({
      table: "items",
      method: "eq",
      args: ["id", "item-1"],
    });
  });

  test("item_lotsのupdateがエラーを返した場合、syncItemAggregateは呼ばれずエラーになる", async () => {
    responseQueues.item_lots = [{ data: null, error: { message: "update failed" } }];

    const { result } = renderHook(() => useUpdateLot(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          lotId: "lot-1",
          itemId: "item-1",
          values: { units: 1 },
        }),
      ).rejects.toMatchObject({ message: "update failed" });
    });

    const itemsUpdateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(itemsUpdateCall).toBeUndefined();
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

  test("複数の未開封ロットの合計値を正しく算出する", async () => {
    responseQueues.item_lots = [
      {
        data: [
          { units: 2, expiry_date: "2026-09-10", opened_remaining: null },
          { units: 3, expiry_date: "2026-08-20", opened_remaining: null },
          { units: 1, expiry_date: "2026-10-01", opened_remaining: null },
        ],
        error: null,
      },
    ];
    responseQueues.items = [{ data: { content_amount: 1 }, error: null }];

    await syncItemAggregate("item-1");

    const updateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      units: 6,
      opened_remaining: null,
      expiry_date: "2026-08-20",
    });
  });

  test("在庫が0のロット(units=0かつ未開封)は集計・期限日から除外する", async () => {
    // The depleted lot's stale expiry_date (which is earlier than the
    // remaining lot's) must not leak into the item's aggregate expiry_date,
    // otherwise a fully-consumed lot keeps the item showing up in the
    // expiry calendar even though it has no stock left.
    responseQueues.item_lots = [
      {
        data: [
          { units: 0, expiry_date: "2026-07-01", opened_remaining: null },
          { units: 2, expiry_date: "2026-09-01", opened_remaining: null },
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
      expiry_date: "2026-09-01",
    });
  });

  test("全ロットが在庫0の場合、units=0・expiry_date=nullで更新する", async () => {
    responseQueues.item_lots = [
      {
        data: [
          { units: 0, expiry_date: "2026-07-01", opened_remaining: null },
          { units: 0, expiry_date: "2026-07-15", opened_remaining: null },
        ],
        error: null,
      },
    ];
    responseQueues.items = [{ data: { content_amount: 1 }, error: null }];

    await syncItemAggregate("item-1");

    const updateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      units: 0,
      opened_remaining: null,
      expiry_date: null,
    });
  });
});
