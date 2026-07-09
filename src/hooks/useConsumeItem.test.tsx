import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper, makeItem, makeLot } from "@/test/testUtils";
import type { Item } from "@/types/item";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { useConsumeItem } = await import("@/hooks/useConsumeItem");

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useConsumeItem", () => {
  test("ロットがあれば FIFO でロットから消費する", async () => {
    const item = makeItem({ id: "item-1", units: 2 });
    const lot = makeLot({ item_id: "item-1", units: 2 });
    const updated = makeItem({ id: "item-1", units: 1 });

    // 1) FIFO ロット取得 2) consumeLot のロット更新 3) sync の lots 集計
    sb.enqueue("item_lots", { data: [lot] }, { data: makeLot({ units: 1 }) }, { data: [] });
    sb.enqueue("consumption_logs", { error: null });
    // 1) sync の items 更新 2) 最終再取得 single
    sb.enqueue("items", { error: null }, { data: updated });

    const { wrapper, queryClient } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({ item, deltaAmount: 1 });
    });

    expect(value?.units).toBe(1);
    expect(queryClient.getQueryData(["items", "item-1"])).toEqual(updated);
  });

  test("ロットがなければ items 直接更新にフォールバックする", async () => {
    const item = makeItem({ id: "item-1", units: 3, content_amount: 1 });
    const updated = makeItem({ id: "item-1", units: 2 });

    sb.enqueue("item_lots", { data: [] });
    // 1) items 直接更新 2) 最終再取得 single
    sb.enqueue("items", { error: null }, { data: updated });
    sb.enqueue("consumption_logs", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({ item, deltaAmount: 1 });
    });

    expect(value?.units).toBe(2);

    const itemsQueries = sb.queriesFor("items");
    expect(itemsQueries[0]?.ops[0]?.method).toBe("update");
    expect(itemsQueries[0]?.ops[0]?.args[0]).toMatchObject({ units: 2 });

    const logQuery = sb.queriesFor("consumption_logs")[0];
    expect(logQuery?.ops[0]?.args[0]).toMatchObject({
      units_before: 3,
      units_after: 2,
    });
  });

  test("フォールバック時の在庫不足はエラーになる", async () => {
    const item = makeItem({ id: "item-1", units: 1, content_amount: 1 });
    sb.enqueue("item_lots", { data: [] });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ item, deltaAmount: 10 })).rejects.toThrow(
        "insufficientStock",
      );
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("ロット取得エラーは throw する", async () => {
    sb.enqueue("item_lots", { error: { message: "lots failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ item: makeItem(), deltaAmount: 1 }),
      ).rejects.toBeDefined();
    });
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ item: makeItem(), deltaAmount: 1 }),
      ).rejects.toThrow("Not authenticated");
    });
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ item: makeItem(), deltaAmount: 1 }),
      ).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("最終再取得のエラーは throw する", async () => {
    const item = makeItem({ id: "item-1", units: 3 });
    sb.enqueue("item_lots", { data: [] });
    sb.enqueue("items", { error: null }, { error: { message: "refetch failed" } });
    sb.enqueue("consumption_logs", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ item, deltaAmount: 1 })).rejects.toBeDefined();
    });
  });
});
