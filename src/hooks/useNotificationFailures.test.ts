import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface Response {
  data: unknown;
  error: unknown;
}

let getUserResponse: { data: { user: { id: string } | null }; error: unknown } = {
  data: { user: { id: "user-1" } },
  error: null,
};
let selectResponse: Response = { data: [], error: null };
let callLog: Array<{ method: string; args: unknown[] }> = [];

const makeBuilder = () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    builder[method] = (...args: unknown[]) => {
      callLog.push({ method, args });
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    callLog.push({ method: "limit", args });
    return Promise.resolve(selectResponse);
  };
  return builder;
};

const fromMock = mock<(table: string) => unknown>(() => makeBuilder());
const getUserMock = mock(() => Promise.resolve(getUserResponse));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { useNotificationFailures } = await import("@/hooks/useNotificationFailures");

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
};

beforeEach(() => {
  getUserResponse = { data: { user: { id: "user-1" } }, error: null };
  selectResponse = { data: [], error: null };
  callLog = [];
  fromMock.mockClear();
  getUserMock.mockClear();
});

describe("useNotificationFailures", () => {
  test("自ユーザーの失敗履歴を新しい順に最大20件取得する", async () => {
    const rows = [{ id: "n1", notification_type: "expiry", channel: "push" }];
    selectResponse = { data: rows, error: null };
    const { result } = renderHook(() => useNotificationFailures(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith("notification_failures");
    expect(callLog.find((c) => c.method === "eq")?.args).toEqual(["user_id", "user-1"]);
    expect(callLog.find((c) => c.method === "order")?.args).toEqual([
      "failed_at",
      { ascending: false },
    ]);
    expect(callLog.find((c) => c.method === "limit")?.args).toEqual([20]);
  });

  test("data が null のときは空配列を返す", async () => {
    selectResponse = { data: null, error: null };
    const { result } = renderHook(() => useNotificationFailures(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("未認証ならクエリせずエラーになる", async () => {
    getUserResponse = { data: { user: null }, error: null };
    const { result } = renderHook(() => useNotificationFailures(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("クエリエラーは error 状態になる", async () => {
    selectResponse = { data: null, error: new Error("db down") };
    const { result } = renderHook(() => useNotificationFailures(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
