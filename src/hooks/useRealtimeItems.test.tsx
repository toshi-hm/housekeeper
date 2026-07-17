import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

type ChangeHandler = () => void;
type StatusCallback = (status: string) => void;

interface FakeChannel {
  on: (event: string, filter: unknown, cb: ChangeHandler) => FakeChannel;
  subscribe: (cb?: StatusCallback) => FakeChannel;
  handlers: ChangeHandler[];
  statusCallback: StatusCallback | undefined;
}

let createdChannels: FakeChannel[] = [];
const removedChannels: FakeChannel[] = [];
let removeChannelResult: "ok" | "timed out" | "error" = "ok";

const makeChannel = (): FakeChannel => {
  const ch: FakeChannel = {
    handlers: [],
    statusCallback: undefined,
    on: (_event, _filter, cb) => {
      ch.handlers.push(cb);
      return ch;
    },
    subscribe: (cb) => {
      ch.statusCallback = cb;
      return ch;
    },
  };
  return ch;
};

const channelMock = mock(() => {
  const ch = makeChannel();
  createdChannels.push(ch);
  return ch;
});

const removeChannelMock = mock((ch: FakeChannel) => {
  removedChannels.push(ch);
  return Promise.resolve(removeChannelResult);
});

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

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  createdChannels = [];
  removedChannels.length = 0;
  removeChannelResult = "ok";
  channelMock.mockClear();
  removeChannelMock.mockClear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("useRealtimeItems", () => {
  test("3 テーブルを購読し、変更イベントで該当クエリを無効化する", () => {
    const qc = new QueryClient();
    const invalidateSpy = mock(() => Promise.resolve());
    qc.invalidateQueries = invalidateSpy as unknown as typeof qc.invalidateQueries;

    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });

    // items / item_lots / shopping_list_items の 3 テーブルを購読
    expect(channelMock).toHaveBeenCalled();
    const channel = createdChannels[0]!;
    expect(channel.handlers.length).toBe(3);

    // postgres_changes イベント発火 → invalidateQueries が呼ばれる
    channel.handlers.forEach((cb) => cb());
    expect(invalidateSpy).toHaveBeenCalledTimes(3);

    // アンマウントで購読解除
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  test("#475 バグ2: CHANNEL_ERROR を検知すると該当channelを破棄し、再購読をリトライする", async () => {
    const qc = new QueryClient();
    qc.invalidateQueries = mock(() => Promise.resolve()) as unknown as typeof qc.invalidateQueries;

    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });
    const firstChannel = createdChannels[0]!;
    expect(firstChannel.statusCallback).toBeDefined();

    // Realtimeサーバー側の障害等でCHANNEL_ERRORが通知されたケースを模倣
    firstChannel.statusCallback?.("CHANNEL_ERROR");
    await flushMicrotasks();

    // 失敗したchannelは破棄される（サイレントに握りつぶさない）
    expect(removedChannels).toContain(firstChannel);

    unmount();
  });

  test("#475 バグ1: offline/online の連打はデバウンスされ、unsubscribeの完了を待ってからsubscribeする", async () => {
    const qc = new QueryClient();
    qc.invalidateQueries = mock(() => Promise.resolve()) as unknown as typeof qc.invalidateQueries;

    const { unmount } = renderHook(() => useRealtimeItems(), { wrapper: makeWrapper(qc) });
    expect(createdChannels.length).toBe(1);
    channelMock.mockClear();

    // 短時間に offline → online → offline → online を連打
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));

    // デバウンス時間内はまだ何も起きない
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(channelMock).not.toHaveBeenCalled();

    // デバウンス完了後、最終状態(online)だけが反映され、新しいchannelが1つだけ張られる
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(channelMock).toHaveBeenCalledTimes(1);

    unmount();
  });
});
