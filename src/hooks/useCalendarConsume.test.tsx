import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper, makeItem } from "@/test/testUtils";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { useCalendarConsume } = await import("@/hooks/useCalendarConsume");

const todayStr = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useCalendarConsume", () => {
  test("check: 対象ロットを消化して pendingRemovalList に追加する", async () => {
    const item = makeItem({ id: "item-1", name: "牛乳", content_amount: 2 });
    // 1) ロット一覧 2) ロット更新 3) sync の lots 集計
    sb.enqueue(
      "item_lots",
      { data: [{ id: "lot-1", units: 2, opened_remaining: null, expiry_date: todayStr() }] },
      { error: null },
      { data: [] },
    );
    // ログ insert (select single)
    sb.enqueue("consumption_logs", { data: { id: "log-1" } });
    // sync の items 更新
    sb.enqueue("items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await result.current.check(item);
    });

    expect(result.current.pendingRemovalList).toEqual([{ itemId: "item-1", itemName: "牛乳" }]);

    const logQuery = sb.queriesFor("consumption_logs")[0];
    expect(logQuery?.ops[0]?.args[0]).toMatchObject({
      item_id: "item-1",
      delta_amount: 4, // units(2) * content_amount(2)
      units_before: 2,
      units_after: 0,
    });
  });

  test("check: 対象ロットがなければ warning トーストのみ", async () => {
    sb.enqueue("item_lots", {
      data: [
        // units=0 かつ未開封 → 対象外
        { id: "lot-1", units: 0, opened_remaining: null, expiry_date: todayStr() },
        // 期限なし → 対象外
        { id: "lot-2", units: 1, opened_remaining: null, expiry_date: null },
        // 来月以降 → 対象外
        { id: "lot-3", units: 1, opened_remaining: null, expiry_date: "2099-12-31" },
      ],
    });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await result.current.check(makeItem());
    });

    expect(toastCalls.some((call) => call.variant === "warning")).toBe(true);
    expect(result.current.pendingRemovalList).toEqual([]);
  });

  test("check: ロット取得エラーで error トーストを出して throw する", async () => {
    sb.enqueue("item_lots", { error: { message: "lots failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await expect(result.current.check(makeItem())).rejects.toBeDefined();
    });

    expect(toastCalls.some((call) => call.variant === "error")).toBe(true);
  });

  test("check: ロット更新エラーで throw する", async () => {
    sb.enqueue(
      "item_lots",
      { data: [{ id: "lot-1", units: 1, opened_remaining: null, expiry_date: todayStr() }] },
      { error: { message: "update failed" } },
    );

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await expect(result.current.check(makeItem())).rejects.toBeDefined();
    });

    expect(toastCalls.some((call) => call.variant === "error")).toBe(true);
  });

  test("check: 未認証なら error トーストを出して throw する", async () => {
    sb.setUser(null);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await expect(result.current.check(makeItem())).rejects.toThrow("Not authenticated");
    });

    expect(toastCalls.some((call) => call.variant === "error")).toBe(true);
  });

  test("check: オフラインなら offline トーストを出して throw する", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await expect(result.current.check(makeItem())).rejects.toThrow();
    });

    expect(toastCalls.some((call) => call.variant === "error")).toBe(true);
  });

  test("undo: 消化を取り消してログを削除し pending から除去する", async () => {
    const item = makeItem({ id: "item-1", name: "牛乳" });
    // check 分: 1) ロット一覧 2) 更新 3) sync 集計
    sb.enqueue(
      "item_lots",
      {
        data: [{ id: "lot-1", units: 2, opened_remaining: 0.5, expiry_date: todayStr() }],
      },
      { error: null },
      { data: [] },
    );
    sb.enqueue("consumption_logs", { data: { id: "log-1" } });
    sb.enqueue("items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await result.current.check(item);
    });
    await waitFor(() => expect(result.current.pendingRemovalList).toHaveLength(1));

    // undo 分: 1) ロット復元 update 2) sync 集計
    sb.enqueue("item_lots", { error: null }, { data: [] });
    sb.enqueue("consumption_logs", { error: null });
    sb.enqueue("items", { error: null });

    await act(async () => {
      await result.current.undo("item-1");
    });

    expect(result.current.pendingRemovalList).toEqual([]);

    const lotQueries = sb.queriesFor("item_lots");
    const restoreQuery = lotQueries[3];
    expect(restoreQuery?.ops[0]?.method).toBe("update");
    expect(restoreQuery?.ops[0]?.args[0]).toMatchObject({ units: 2, opened_remaining: 0.5 });
  });

  test("undo: pending がなければ何もしない", async () => {
    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await result.current.undo("unknown-item");
    });

    expect(sb.queries).toHaveLength(0);
  });

  test("undo: 復元エラーで error トーストを出す (throw しない)", async () => {
    const item = makeItem({ id: "item-1" });
    sb.enqueue(
      "item_lots",
      { data: [{ id: "lot-1", units: 1, opened_remaining: null, expiry_date: todayStr() }] },
      { error: null },
      { data: [] },
    );
    sb.enqueue("consumption_logs", { data: { id: "log-1" } });
    sb.enqueue("items", { error: null });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await result.current.check(item);
    });

    sb.enqueue("item_lots", { error: { message: "restore failed" } });

    await act(async () => {
      await result.current.undo("item-1");
    });

    expect(toastCalls.some((call) => call.variant === "error")).toBe(true);
    // pending は残ったまま
    expect(result.current.pendingRemovalList).toHaveLength(1);
  });
});

describe("Branch カバレッジ補完 (useCalendarConsume)", () => {
  test("units=0 でも開封済みロットは消化対象になり、ログなしでも pending に入る", async () => {
    const item = makeItem({ id: "item-open", name: "開封品" });
    sb.enqueue(
      "item_lots",
      { data: [{ id: "lot-open", units: 0, opened_remaining: 0.5, expiry_date: todayStr() }] },
      { error: null },
      { data: [] },
    );
    // ログ insert が null を返す (id なし)
    sb.enqueue("consumption_logs", { data: null });
    sb.enqueue("items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCalendarConsume(), { wrapper });

    await act(async () => {
      await result.current.check(item);
    });

    expect(result.current.pendingRemovalList).toEqual([
      { itemId: "item-open", itemName: "開封品" },
    ]);

    // オフラインで undo → offline トースト、pending は残る
    setNavigatorOnline(false);
    await act(async () => {
      await result.current.undo("item-open");
    });
    expect(result.current.pendingRemovalList).toHaveLength(1);
    setNavigatorOnline(true);

    // logId が null の undo はログ削除をスキップして成功する
    sb.enqueue("item_lots", { error: null }, { data: [] });
    sb.enqueue("items", { error: null });

    await act(async () => {
      await result.current.undo("item-open");
    });

    expect(result.current.pendingRemovalList).toEqual([]);
    expect(
      sb
        .queriesFor("consumption_logs")
        .filter((query) => query.ops.some((op) => op.method === "delete")),
    ).toHaveLength(0);
  });
});
