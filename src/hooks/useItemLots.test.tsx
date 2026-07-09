import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper, makeLot } from "@/test/testUtils";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { createLot, syncItemAggregate, useConsumeLot, useItemLots, useUpdateLot } =
  await import("@/hooks/useItemLots");

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useItemLots", () => {
  test("itemId のロット一覧を取得する", async () => {
    const lots = [makeLot({ id: "44444444-4444-4444-8444-444444444444" })];
    sb.enqueue("item_lots", { data: lots });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItemLots("item-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(lots);
  });

  test("取得エラーで isError になる", async () => {
    sb.enqueue("item_lots", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItemLots("item-1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  test("itemId が空ならクエリを実行しない", () => {
    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItemLots(""), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(sb.queriesFor("item_lots")).toHaveLength(0);
  });
});

describe("createLot", () => {
  test("既定値 (null) を補完して insert する", async () => {
    const lot = makeLot();
    sb.enqueue("item_lots", { data: lot });

    const created = await createLot("user-1", "item-1", { units: 2 });
    expect(created).toEqual(lot);

    const [query] = sb.queriesFor("item_lots");
    expect(query?.ops[0]?.method).toBe("insert");
    expect(query?.ops[0]?.args[0]).toMatchObject({
      user_id: "user-1",
      item_id: "item-1",
      units: 2,
      opened_remaining: null,
      purchase_date: null,
      expiry_date: null,
    });
  });

  test("insert エラーは throw する", async () => {
    sb.enqueue("item_lots", { error: { message: "insert failed" } });
    await expect(createLot("user-1", "item-1", { units: 1 })).rejects.toBeDefined();
  });
});

describe("syncItemAggregate", () => {
  test("ロットから units / 最短期限 / opened_remaining を集計して items を更新する", async () => {
    sb.enqueue("item_lots", {
      data: [
        { units: 2, expiry_date: "2026-09-01", opened_remaining: null },
        { units: 1, expiry_date: "2026-08-01", opened_remaining: 0.5 },
      ],
    });
    sb.enqueue("items", { error: null });

    await syncItemAggregate("item-1");

    const [itemsQuery] = sb.queriesFor("items");
    expect(itemsQuery?.ops[0]?.method).toBe("update");
    expect(itemsQuery?.ops[0]?.args[0]).toMatchObject({
      units: 3,
      expiry_date: "2026-08-01",
      opened_remaining: 0.5,
    });
  });

  test("開封済みロットが複数あるときは opened_remaining を null にする", async () => {
    sb.enqueue("item_lots", {
      data: [
        { units: 1, expiry_date: null, opened_remaining: 0.5 },
        { units: 1, expiry_date: null, opened_remaining: 0.3 },
      ],
    });
    sb.enqueue("items", { error: null });

    await syncItemAggregate("item-1");

    const [itemsQuery] = sb.queriesFor("items");
    expect(itemsQuery?.ops[0]?.args[0]).toMatchObject({
      units: 2,
      expiry_date: null,
      opened_remaining: null,
    });
  });

  test("ロット取得エラーは throw する", async () => {
    sb.enqueue("item_lots", { error: { message: "lots failed" } });
    await expect(syncItemAggregate("item-1")).rejects.toBeDefined();
  });

  test("items 更新エラーは throw する", async () => {
    sb.enqueue("item_lots", { data: [] });
    sb.enqueue("items", { error: { message: "update failed" } });
    await expect(syncItemAggregate("item-1")).rejects.toBeDefined();
  });
});

describe("useConsumeLot", () => {
  const lot = makeLot({ units: 2, opened_remaining: null });
  const itemInfo = { content_amount: 1, content_unit: "個" };

  test("消費に成功するとロット更新とログ記録を行う", async () => {
    const updatedLot = makeLot({ units: 1 });
    // 1) ロット更新 single 2) sync の lots 集計
    sb.enqueue("item_lots", { data: updatedLot }, { data: [] });
    sb.enqueue("consumption_logs", { error: null });
    sb.enqueue("items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeLot(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ lot, item: itemInfo, deltaAmount: 1 });
    });

    const logQuery = sb.queriesFor("consumption_logs")[0];
    expect(logQuery?.ops[0]?.method).toBe("insert");
    expect(logQuery?.ops[0]?.args[0]).toMatchObject({
      delta_amount: 1,
      units_before: 2,
      units_after: 1,
    });
  });

  test("在庫不足なら insufficientStock エラーを投げる", async () => {
    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useConsumeLot(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ lot, item: itemInfo, deltaAmount: 100 }),
      ).rejects.toThrow("insufficientStock");
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("ログ insert 失敗は非致命 (console.warn)", async () => {
    sb.enqueue("item_lots", { data: makeLot({ units: 1 }) }, { data: [] });
    sb.enqueue("consumption_logs", { error: { message: "log failed" } });
    sb.enqueue("items", { error: null });

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    try {
      const { wrapper } = createHookWrapper();
      const { result } = renderHook(() => useConsumeLot(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ lot, item: itemInfo, deltaAmount: 1 });
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumeLot(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ lot, item: itemInfo, deltaAmount: 1 }),
      ).rejects.toThrow("Not authenticated");
    });
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useConsumeLot(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ lot, item: itemInfo, deltaAmount: 1 }),
      ).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("useUpdateLot", () => {
  test("ロット更新後に集計を同期する", async () => {
    const updated = makeLot({ units: 5 });
    // 1) update single 2) sync lots 集計
    sb.enqueue(
      "item_lots",
      { data: updated },
      { data: [{ units: 5, expiry_date: null, opened_remaining: null }] },
    );
    sb.enqueue("items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdateLot(), { wrapper });

    let value: unknown;
    await act(async () => {
      value = await result.current.mutateAsync({
        lotId: "lot-1",
        itemId: "item-1",
        values: { units: 5 },
      });
    });

    expect(value).toEqual(updated);

    const [itemsQuery] = sb.queriesFor("items");
    expect(itemsQuery?.ops[0]?.args[0]).toMatchObject({ units: 5 });
  });

  test("更新エラーで error トーストを出す", async () => {
    sb.enqueue("item_lots", { error: { message: "update failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateLot(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ lotId: "lot-1", itemId: "item-1", values: { units: 1 } }),
      ).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateLot(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ lotId: "lot-1", itemId: "item-1", values: { units: 1 } }),
      ).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});
