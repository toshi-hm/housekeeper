import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import type { ArchivedShoppingItem } from "@/types/shopping";

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
    order: chainMethod("order"),
    range: chainMethod("range"),
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

const { usePurchaseHistory } = await import("@/hooks/usePurchaseHistory");

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

const makeArchivedItem = (overrides: Partial<ArchivedShoppingItem> = {}): ArchivedShoppingItem => ({
  id: "archive-1",
  user_id: "user-1",
  name: "牛乳",
  desired_units: 1,
  note: null,
  archived_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("usePurchaseHistory", () => {
  test("#653: id をタイブレーカーにしてrangeでページングする", async () => {
    responseQueues.shopping_list_archive = [{ data: [makeArchivedItem()], error: null }];

    const { result } = renderHook(() => usePurchaseHistory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([makeArchivedItem()]);

    const orderCalls = callLog.filter(
      (c) => c.table === "shopping_list_archive" && c.method === "order",
    );
    expect(orderCalls).toContainEqual({
      table: "shopping_list_archive",
      method: "order",
      args: ["archived_at", { ascending: false }],
    });
    expect(orderCalls).toContainEqual({
      table: "shopping_list_archive",
      method: "order",
      args: ["id", { ascending: true }],
    });

    const rangeCalls = callLog.filter(
      (c) => c.table === "shopping_list_archive" && c.method === "range",
    );
    expect(rangeCalls).toContainEqual({
      table: "shopping_list_archive",
      method: "range",
      args: [0, 999],
    });
  });

  test("#653: 1ページ目がpageSizeちょうど返ると2ページ目もfetchして結合する", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) =>
      makeArchivedItem({ id: `archive-${i}` }),
    );
    const secondPage = [makeArchivedItem({ id: "archive-last" })];
    responseQueues.shopping_list_archive = [
      { data: fullPage, error: null },
      { data: secondPage, error: null },
    ];

    const { result } = renderHook(() => usePurchaseHistory(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1001);

    const rangeCalls = callLog.filter(
      (c) => c.table === "shopping_list_archive" && c.method === "range",
    );
    expect(rangeCalls).toContainEqual({
      table: "shopping_list_archive",
      method: "range",
      args: [1000, 1999],
    });
  });
});
