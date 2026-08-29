import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import { ConcurrentUpdateError } from "@/lib/requireOnline";
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

// NOTE: Only "@/lib/supabase" is mocked here (not "@/hooks/useItemLots") so
// that consumeItem's delegation to the real consumeLot is exercised. Mocking
// a hook module globally with mock.module leaks across test files sharing
// the same process (bun:test's module registry is process-wide), which would
// otherwise corrupt useItemLots.test.ts's own import of the real consumeLot.
mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { consumeItem, undoConsumeItem, useConsumeItem } = await import("@/hooks/useConsumeItem");
const { ToastContext } = await import("@/lib/toast-context");

const makeWrapper = (qc: QueryClient, toastSpy?: (message: string, variant?: string) => void) => {
  const stubToast = { toasts: [], toast: toastSpy ?? (() => {}), dismiss: () => {} };
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(ToastContext, { value: stubToast }, children),
    );
};

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

  test("ロットが存在しない場合、noteがconsumption_logs.noteに記録される (#418)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];
    responseQueues.consumption_logs = [{ data: null, error: null }];
    responseQueues.items = [{ data: makeItem({ units: 2 }), error: null }];

    await consumeItem({ item: makeItem(), deltaAmount: 1, note: "贈り物" });

    const logInsert = callLog.find((c) => c.table === "consumption_logs" && c.method === "insert");
    expect(logInsert?.args[0]).toMatchObject({ note: "贈り物" });
  });

  test("ロットが存在しない場合でもmaybeAutoReorderが呼ばれ、閾値以下なら買い物リストへ自動追加する (#733)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];
    responseQueues.consumption_logs = [{ data: null, error: null }];
    responseQueues.items = [
      { data: makeItem({ units: 0 }), error: null }, // items.update (conditional, #911)
      {
        data: {
          id: "item-1",
          user_id: "user-1",
          name: "Test Item",
          units: 0,
          auto_reorder: true,
          reorder_threshold: 1,
        },
        error: null,
      }, // maybeAutoReorder's own items select
      { data: makeItem({ units: 0 }), error: null }, // final re-select in consumeItem
    ];
    responseQueues.shopping_list_items = [{ data: null, error: null }];

    await consumeItem({ item: makeItem({ units: 1 }), deltaAmount: 1 });

    const shoppingInsert = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "insert",
    );
    expect(shoppingInsert?.args[0]).toMatchObject({ linked_item_id: "item-1", auto_added: true });
  });

  test("ロットが存在しない場合、items直接更新は読み取り時点のunits/opened_remainingを条件にする (#911)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];
    responseQueues.consumption_logs = [{ data: null, error: null }];
    responseQueues.items = [{ data: makeItem({ units: 2 }), error: null }];

    await consumeItem({ item: makeItem({ units: 3, opened_remaining: null }), deltaAmount: 1 });

    const itemsUpdateEqCalls = callLog.filter(
      (c) => c.table === "items" && c.method === "eq" && c.args[0] === "units",
    );
    expect(itemsUpdateEqCalls[0]?.args).toEqual(["units", 3]);
    const itemsUpdateIsCall = callLog.find(
      (c) => c.table === "items" && c.method === "is" && c.args[0] === "opened_remaining",
    );
    expect(itemsUpdateIsCall?.args).toEqual(["opened_remaining", null]);
  });

  test("ロットが存在しない場合、同時消費で対象行が無ければConcurrentUpdateErrorを投げる (#911)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];
    // Conditional update matches no row (another request already changed
    // units/opened_remaining in the meantime) → maybeSingle resolves with
    // data: null.
    responseQueues.items = [{ data: null, error: null }];

    await expect(
      consumeItem({ item: makeItem({ units: 3, opened_remaining: null }), deltaAmount: 1 }),
    ).rejects.toBeInstanceOf(ConcurrentUpdateError);

    // No consumption_logs insert should happen once the conditional update
    // itself found no matching row.
    expect(callLog.some((c) => c.table === "consumption_logs")).toBe(false);
  });
});

describe("undoConsumeItem", () => {
  // 消費の取り消し（#478, #713）: consumeItem が返した _undo メタデータから、
  // 消費前の状態へロールバックする。

  test("kind: 'lot' の場合はrestoreLotConsumption経由でロットとconsumption_logsを復元する", async () => {
    responseQueues.item_lots = [
      { data: { id: "lot-1", units: 1, opened_remaining: null }, error: null }, // conditional update (restore)
      { data: [{ units: 2, expiry_date: null, opened_remaining: null }], error: null }, // syncItemAggregate read
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate read
      { data: null, error: null }, // syncItemAggregate update
    ];

    await undoConsumeItem({
      kind: "lot",
      itemId: "item-1",
      lotId: "lot-1",
      unitsBefore: 2,
      openedRemainingBefore: null,
      unitsAfter: 1,
      openedRemainingAfter: null,
      logId: "log-1",
    });

    const lotUpdateCall = callLog.find((c) => c.table === "item_lots" && c.method === "update");
    expect(lotUpdateCall?.args[0]).toMatchObject({ units: 2, opened_remaining: null });
    const logDeleteCall = callLog.find(
      (c) => c.table === "consumption_logs" && c.method === "delete",
    );
    expect(logDeleteCall).toBeDefined();
    const logEqCall = callLog.find(
      (c) => c.table === "consumption_logs" && c.method === "eq" && c.args[0] === "id",
    );
    expect(logEqCall?.args).toEqual(["id", "log-1"]);
  });

  test("kind: 'direct' の場合はitemsを直接更新し、logIdがあればconsumption_logsを削除する", async () => {
    responseQueues.items = [{ data: null, error: null }]; // items update

    await undoConsumeItem({
      kind: "direct",
      itemId: "item-1",
      unitsBefore: 3,
      openedRemainingBefore: 0.4,
      logId: "log-2",
    });

    const itemsUpdateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(itemsUpdateCall?.args[0]).toMatchObject({ units: 3, opened_remaining: 0.4 });
    const itemsEqCall = callLog.find(
      (c) => c.table === "items" && c.method === "eq" && c.args[0] === "id",
    );
    expect(itemsEqCall?.args).toEqual(["id", "item-1"]);

    const logDeleteCall = callLog.find(
      (c) => c.table === "consumption_logs" && c.method === "delete",
    );
    expect(logDeleteCall).toBeDefined();
    const logEqCall = callLog.find(
      (c) => c.table === "consumption_logs" && c.method === "eq" && c.args[0] === "id",
    );
    expect(logEqCall?.args).toEqual(["id", "log-2"]);
  });

  test("kind: 'direct' でlogIdがnullの場合はconsumption_logsのdeleteを呼ばない", async () => {
    responseQueues.items = [{ data: null, error: null }];

    await undoConsumeItem({
      kind: "direct",
      itemId: "item-1",
      unitsBefore: 1,
      openedRemainingBefore: null,
      logId: null,
    });

    expect(callLog.some((c) => c.table === "consumption_logs")).toBe(false);
  });
});

describe("useConsumeItem", () => {
  test("成功時に買い物リストのキャッシュも無効化する (#649)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];
    responseQueues.consumption_logs = [{ data: null, error: null }];
    responseQueues.items = [{ data: makeItem({ units: 2 }), error: null }];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = mock(() => Promise.resolve());
    qc.invalidateQueries = invalidateSpy as unknown as typeof qc.invalidateQueries;

    const { result } = renderHook(() => useConsumeItem(), { wrapper: makeWrapper(qc) });
    result.current.mutate({ item: makeItem(), deltaAmount: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["shopping"]);
  });

  test("在庫不足エラーはunknownErrorではなく専用メッセージを表示する (#832)", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const toastSpy = mock(() => {});

    const { result } = renderHook(() => useConsumeItem(), {
      wrapper: makeWrapper(qc, toastSpy),
    });
    // content_amount: 1, units: 3 -> totalBefore is 3; requesting 10 exceeds it.
    result.current.mutate({ item: makeItem(), deltaAmount: 10 });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // t() may resolve to either the raw key or the translated string depending
    // on whether "@/lib/i18n" has been initialized elsewhere in this test run.
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringMatching(/insufficientStockError|在庫が足りません|Not enough stock/),
      "error",
    );
    expect(toastSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/^(unknownError|An error occurred|エラーが発生しました)$/),
      "error",
    );
  });
});
