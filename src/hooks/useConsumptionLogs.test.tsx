import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ method: string; args: unknown[] }> = [];
let responseQueue: SupabaseResponse[] = [];
let user: { id: string } | null = { id: "user-1" };

const makeBuilder = (response: SupabaseResponse) => {
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      callLog.push({ method, args });
      return builder;
    };
  Object.assign(builder, {
    select: chain("select"),
    eq: chain("eq"),
    order: chain("order"),
    range: chain("range"),
    then: (resolve: (value: SupabaseResponse) => unknown) => resolve(response),
  });
  return builder;
};

const fromMock = mock(() => makeBuilder(responseQueue.shift() ?? { data: [], error: null }));
const getUserMock = mock(() => Promise.resolve({ data: { user }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { useAllConsumptionLogs, useConsumptionLogs } = await import("@/hooks/useConsumptionLogs");

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

const makeLog = (i: number) => ({
  item_id: "item-1",
  delta_amount: -1,
  delta_unit: "個",
  occurred_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
});

beforeEach(() => {
  callLog = [];
  responseQueue = [];
  user = { id: "user-1" };
  fromMock.mockClear();
  getUserMock.mockClear();
});

describe("useConsumptionLogs", () => {
  test("対象アイテムの消費ログを新しい順に取得する", async () => {
    const logs = [{ id: "l1", item_id: "item-1" }];
    responseQueue = [{ data: logs, error: null }];

    const { result } = renderHook(() => useConsumptionLogs("item-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(logs);
    expect(fromMock).toHaveBeenCalledWith("consumption_logs");
    expect(callLog).toContainEqual({ method: "eq", args: ["item_id", "item-1"] });
    expect(callLog).toContainEqual({
      method: "order",
      args: ["occurred_at", { ascending: false }],
    });
  });

  test("data が null のときは空配列を返す", async () => {
    responseQueue = [{ data: null, error: null }];

    const { result } = renderHook(() => useConsumptionLogs("item-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("Supabase エラーはエラーとして扱う", async () => {
    responseQueue = [{ data: null, error: { message: "db down" } }];

    const { result } = renderHook(() => useConsumptionLogs("item-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("db down");
  });
});

describe("useAllConsumptionLogs", () => {
  test("1000 件ちょうどの場合は次ページも取得する（#622）", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => makeLog(i));
    const secondPage = [makeLog(1)];
    responseQueue = [
      { data: firstPage, error: null },
      { data: secondPage, error: null },
    ];

    const { result } = renderHook(() => useAllConsumptionLogs(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1001);
    expect(callLog).toContainEqual({ method: "range", args: [0, 999] });
    expect(callLog).toContainEqual({ method: "range", args: [1000, 1999] });
  });

  test("occurred_at と id の順で安定ソートする", async () => {
    responseQueue = [{ data: [], error: null }];

    const { result } = renderHook(() => useAllConsumptionLogs(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callLog).toContainEqual({ method: "order", args: ["occurred_at", { ascending: true }] });
    expect(callLog).toContainEqual({ method: "order", args: ["id", { ascending: true }] });
  });

  test("未認証のときはエラーになる", async () => {
    user = null;

    const { result } = renderHook(() => useAllConsumptionLogs(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Not authenticated");
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("enabled: false のときは取得しない", () => {
    const { result } = renderHook(() => useAllConsumptionLogs({ enabled: false }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getUserMock).not.toHaveBeenCalled();
  });

  test("Supabase エラーはエラーとして扱う", async () => {
    responseQueue = [{ data: null, error: { message: "timeout" } }];

    const { result } = renderHook(() => useAllConsumptionLogs(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("timeout");
  });
});
