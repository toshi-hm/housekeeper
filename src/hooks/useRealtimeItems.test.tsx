import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

type ChangeHandler = () => void;

const handlers: ChangeHandler[] = [];
const subscribeMock = mock(() => undefined);
const removeChannelMock = mock(() => Promise.resolve("ok"));

const channelObj = {
  on: mock((_event: string, _filter: unknown, cb: ChangeHandler) => {
    handlers.push(cb);
    return channelObj;
  }),
  subscribe: subscribeMock,
};

const channelMock = mock(() => channelObj);

mock.module("@/lib/supabase", () => ({
  supabase: {
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
}));

const { useRealtimeItems } = await import("@/hooks/useRealtimeItems");

const makeWrapper = (qc: QueryClient) => {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

describe("useRealtimeItems", () => {
  test("3 テーブルを購読し、変更イベントで該当クエリを無効化する", () => {
    const qc = new QueryClient();
    const invalidateSpy = mock(() => Promise.resolve());
    qc.invalidateQueries = invalidateSpy as unknown as typeof qc.invalidateQueries;

    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });

    // items / item_lots / shopping_list_items の 3 テーブルを購読
    expect(channelMock).toHaveBeenCalled();
    expect(handlers.length).toBe(3);

    // postgres_changes イベント発火 → invalidateQueries が呼ばれる
    handlers.forEach((cb) => cb());
    expect(invalidateSpy).toHaveBeenCalledTimes(3);

    // アンマウントで購読解除
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
