import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import type { Item } from "@/types/item";

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

const { useCalendarConsume } = await import("@/hooks/useCalendarConsume");
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

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "テスト商品",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 2,
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

// Build an expiry_date guaranteed to fall within "this month" regardless of
// the host clock, matching useCalendarConsume.check's monthEnd cutoff.
const todayStr = (() => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
})();

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
  getUserMock.mockClear();
});

describe("useCalendarConsume.check", () => {
  test("消費ログinsert成功時、対象ロットをゼロ化し在庫(items)を再集計する", async () => {
    const targetLot = {
      id: "lot-1",
      units: 2,
      opened_remaining: null,
      expiry_date: todayStr,
    };
    responseQueues.item_lots = [
      { data: [targetLot], error: null }, // FEFO select
      { data: null, error: null }, // zero-out update
      { data: [{ units: 0, expiry_date: null, opened_remaining: null }], error: null }, // syncItemAggregate read
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate item read
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.consumption_logs = [{ data: { id: "log-1" }, error: null }];

    const { result } = renderHook(() => useCalendarConsume(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.check(makeItem({ units: 2 }));
    });

    const lotUpdateCall = callLog.find((c) => c.table === "item_lots" && c.method === "update");
    expect(lotUpdateCall?.args[0]).toMatchObject({ units: 0, opened_remaining: null });

    const logInsertCall = callLog.find(
      (c) => c.table === "consumption_logs" && c.method === "insert",
    );
    expect(logInsertCall?.args[0]).toMatchObject({
      item_id: "item-1",
      units_before: 2,
      units_after: 0,
      opened_remaining_before: null,
      opened_remaining_after: null,
    });

    const itemsUpdateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(itemsUpdateCall).toBeDefined();
    expect(itemsUpdateCall?.args[0]).toMatchObject({ units: 0, opened_remaining: null });

    await waitFor(() =>
      expect(result.current.pendingRemovalList).toContainEqual({
        lotId: "lot-1",
        itemId: "item-1",
        itemName: "テスト商品",
      }),
    );
  });

  test("consumption_logsのinsertが失敗しても在庫更新(syncItemAggregate)は継続する (#441)", async () => {
    const targetLot = {
      id: "lot-1",
      units: 1,
      opened_remaining: null,
      expiry_date: todayStr,
    };
    responseQueues.item_lots = [
      { data: [targetLot], error: null },
      { data: null, error: null },
      { data: [{ units: 0, expiry_date: null, opened_remaining: null }], error: null },
    ];
    responseQueues.items = [
      { data: { content_amount: 1 }, error: null },
      { data: null, error: null },
    ];
    responseQueues.consumption_logs = [{ data: null, error: { message: "insert failed" } }];

    const { result } = renderHook(() => useCalendarConsume(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.check(makeItem({ units: 1 }));
    });

    const itemsUpdateCall = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(itemsUpdateCall).toBeDefined();

    await waitFor(() =>
      expect(result.current.pendingRemovalList).toContainEqual({
        lotId: "lot-1",
        itemId: "item-1",
        itemName: "テスト商品",
      }),
    );
  });

  test("今月中に期限が来る有効なロットが無い場合、在庫更新をせずに終了する", async () => {
    responseQueues.item_lots = [{ data: [], error: null }];

    const { result } = renderHook(() => useCalendarConsume(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.check(makeItem());
    });

    const lotUpdateCall = callLog.find((c) => c.table === "item_lots" && c.method === "update");
    expect(lotUpdateCall).toBeUndefined();
    expect(result.current.pendingRemovalList).toEqual([]);
  });
});
