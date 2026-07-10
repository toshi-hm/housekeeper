import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import i18n from "@/lib/i18n";
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

describe("Mutation hardening (useConsumeItem): クエリ内容とエラー伝播", () => {
  test("FIFO ロット取得と最終再取得のクエリ内容を完全一致で検証する", async () => {
    const item = makeItem({ id: "item-1", units: 3 });
    sb.enqueue("item_lots", { data: [] });
    sb.enqueue("items", { error: null }, { data: makeItem({ id: "item-1", units: 2 }) });
    sb.enqueue("consumption_logs", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ item, deltaAmount: 1 });
    });

    expect(sb.queriesFor("item_lots")[0]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["item_id", "item-1"] },
      { method: "order", args: ["created_at", { ascending: true }] },
      { method: "limit", args: [1] },
      { method: "await", args: [] },
    ]);

    // フォールバック時の items 直接更新
    const updateQuery = sb.queriesFor("items")[0];
    const payload = updateQuery?.ops[0]?.args[0] as Record<string, unknown>;
    expect(payload.units).toBe(2);
    expect(payload.opened_remaining).toBeNull();
    expect(updateQuery?.ops[1]).toEqual({ method: "eq", args: ["id", "item-1"] });

    // ログ payload
    expect(sb.queriesFor("consumption_logs")[0]?.ops[0]).toEqual({
      method: "insert",
      args: [
        {
          user_id: "user-1",
          item_id: "item-1",
          delta_amount: 1,
          delta_unit: "個",
          units_before: 3,
          units_after: 2,
          opened_remaining_before: null,
          opened_remaining_after: null,
        },
      ],
    });

    // 最終再取得
    expect(sb.queriesFor("items")[1]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["id", "item-1"] },
      { method: "single", args: [] },
    ]);
  });

  test("ロット取得エラーは元のエラーをそのまま throw する", async () => {
    sb.enqueue("item_lots", { error: { message: "lots failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ item: makeItem(), deltaAmount: 1 }),
      ).rejects.toEqual({ message: "lots failed" });
    });
  });

  test("最終再取得のエラーも元のエラーをそのまま throw する", async () => {
    const item = makeItem({ id: "item-1", units: 3 });
    sb.enqueue("item_lots", { data: [] });
    sb.enqueue("items", { error: null }, { error: { message: "refetch failed" } });
    sb.enqueue("consumption_logs", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ item, deltaAmount: 1 })).rejects.toEqual({
        message: "refetch failed",
      });
    });
  });

  test("オフラインは offlineError、通常エラーは unknownError の文言でトーストする", async () => {
    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });

    setNavigatorOnline(false);
    await act(async () => {
      await expect(
        result.current.mutateAsync({ item: makeItem(), deltaAmount: 1 }),
      ).rejects.toThrow();
    });
    await waitFor(() =>
      expect(toastCalls[0]).toEqual({ message: i18n.t("common:offlineError"), variant: "error" }),
    );

    setNavigatorOnline(true);
    sb.enqueue("item_lots", { error: { message: "boom" } });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ item: makeItem(), deltaAmount: 1 }),
      ).rejects.toBeDefined();
    });
    await waitFor(() =>
      expect(toastCalls[1]).toEqual({ message: i18n.t("common:unknownError"), variant: "error" }),
    );
  });
});

describe("Mutation hardening 2 (useConsumeItem): ロット経路とフォールバック経路の判別", () => {
  test("ロットあり: ログはロットの units を使い、items の直接更新は行わない", async () => {
    // ロット units=5 / アイテム units=2 で経路を判別できるようにする
    const item = makeItem({ id: "item-1", units: 2, content_amount: 1, opened_remaining: null });
    const lot = makeLot({ item_id: "item-1", units: 5, opened_remaining: null });

    sb.enqueue("item_lots", { data: [lot] }, { data: makeLot({ units: 4 }) }, { data: [] });
    sb.enqueue("consumption_logs", { error: null });
    sb.enqueue("items", { error: null }, { data: makeItem({ id: "item-1", units: 4 }) });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ item, deltaAmount: 1 });
    });

    // ログの units_before はロット由来 (5)。フォールバックだと item 由来 (2) になる。
    const logPayload = sb.queriesFor("consumption_logs")[0]?.ops[0]?.args[0] as Record<
      string,
      unknown
    >;
    expect(logPayload.units_before).toBe(5);
    expect(logPayload.units_after).toBe(4);

    // item_lots に対する update が発行される (フォールバックでは発行されない)
    const lotUpdate = sb.queriesFor("item_lots")[1];
    expect(lotUpdate?.ops[0]?.method).toBe("update");
    expect(lotUpdate?.ops[1]).toEqual({ method: "eq", args: ["id", lot.id] });
  });

  test("フォールバック: ログはアイテムの units と opened_remaining を使う", async () => {
    const item = makeItem({ id: "item-1", units: 2, content_amount: 1, opened_remaining: 0.5 });
    sb.enqueue("item_lots", { data: [] });
    sb.enqueue("items", { error: null }, { data: makeItem({ id: "item-1" }) });
    sb.enqueue("consumption_logs", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ item, deltaAmount: 0.5 });
    });

    const logPayload = sb.queriesFor("consumption_logs")[0]?.ops[0]?.args[0] as Record<
      string,
      unknown
    >;
    expect(logPayload.units_before).toBe(2);
    expect(logPayload.opened_remaining_before).toBe(0.5);

    // items への直接 update がフォールバックの証拠
    expect(sb.queriesFor("items")[0]?.ops[0]?.method).toBe("update");
    // item_lots への update は発行されない
    expect(
      sb.queriesFor("item_lots").filter((query) => query.ops[0]?.method === "update"),
    ).toHaveLength(0);
  });
});
