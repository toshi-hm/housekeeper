import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface OnCall {
  event: string;
  filter: { event: string; schema: string; table: string };
  callback: () => void;
}

const onCalls: OnCall[] = [];
const channelNames: string[] = [];
let subscribeCount = 0;
let removeCount = 0;

const channelObj = {
  on: (event: string, filter: OnCall["filter"], callback: () => void) => {
    onCalls.push({ event, filter, callback });
    return channelObj;
  },
  subscribe: () => {
    subscribeCount += 1;
    return channelObj;
  },
};

mock.module("@/lib/supabase", () => ({
  supabase: {
    channel: (name: string) => {
      channelNames.push(name);
      return channelObj;
    },
    removeChannel: () => {
      removeCount += 1;
      return Promise.resolve("ok");
    },
  },
}));

const { useRealtimeItems } = await import("@/hooks/useRealtimeItems");

const makeWrapper = (qc: QueryClient) => {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

const setOnline = (online: boolean) => {
  Object.defineProperty(globalThis.navigator, "onLine", { value: online, configurable: true });
};

beforeEach(() => {
  onCalls.length = 0;
  channelNames.length = 0;
  subscribeCount = 0;
  removeCount = 0;
  setOnline(true);
});

describe("useRealtimeItems", () => {
  test("housekeeper-realtime チャンネルで 3 テーブルを購読し、変更で対応キーを無効化する", () => {
    const qc = new QueryClient();
    const invalidateSpy = mock(() => Promise.resolve());
    qc.invalidateQueries = invalidateSpy as unknown as typeof qc.invalidateQueries;

    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });

    expect(channelNames).toEqual(["housekeeper-realtime"]);
    expect(subscribeCount).toBe(1);

    // postgres_changes を public スキーマの全イベントで購読している
    expect(onCalls.map((call) => ({ event: call.event, filter: call.filter }))).toEqual([
      { event: "postgres_changes", filter: { event: "*", schema: "public", table: "items" } },
      { event: "postgres_changes", filter: { event: "*", schema: "public", table: "item_lots" } },
      {
        event: "postgres_changes",
        filter: { event: "*", schema: "public", table: "shopping_list_items" },
      },
    ]);

    // 各テーブルの変更で対応する Query キーが無効化される
    onCalls.forEach((call) => call.callback());
    expect(invalidateSpy.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      { queryKey: ["items"] },
      { queryKey: ["item-lots"] },
      { queryKey: ["shopping"] },
    ]);

    unmount();
    expect(removeCount).toBe(1);
  });

  test("オフライン起動時は購読せず、online イベントで購読 + 全キー再取得する", () => {
    setOnline(false);
    const qc = new QueryClient();
    const invalidateSpy = mock(() => Promise.resolve());
    qc.invalidateQueries = invalidateSpy as unknown as typeof qc.invalidateQueries;

    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });

    expect(subscribeCount).toBe(0);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(subscribeCount).toBe(1);
    // オフライン中の変更を取り込むため全キーを 1 回ずつ無効化する
    expect(invalidateSpy.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      { queryKey: ["items"] },
      { queryKey: ["item-lots"] },
      { queryKey: ["shopping"] },
    ]);

    unmount();
  });

  test("offline イベントで購読を解除し、二重購読はしない", () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });

    expect(subscribeCount).toBe(1);

    // 購読済みのまま online が来ても二重購読しない
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(subscribeCount).toBe(1);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(removeCount).toBe(1);

    // 解除後の offline は何もしない
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(removeCount).toBe(1);

    // online で再購読できる
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(subscribeCount).toBe(2);

    unmount();
    expect(removeCount).toBe(2);
  });

  test("アンマウント後は window イベントに反応しない", () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });
    unmount();

    const before = subscribeCount;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(subscribeCount).toBe(before);
  });
});
