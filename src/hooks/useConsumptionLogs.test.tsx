import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { useConsumptionLogs } = await import("@/hooks/useConsumptionLogs");

beforeEach(() => {
  sb.reset();
});

describe("useConsumptionLogs", () => {
  test("itemId の消費履歴を新しい順で取得する", async () => {
    const logs = [{ id: "log-1", item_id: "item-1", delta_amount: 1 }];
    sb.enqueue("consumption_logs", { data: logs });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumptionLogs("item-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(logs);

    const [query] = sb.queriesFor("consumption_logs");
    expect(query?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["item_id", "item-1"] },
      { method: "order", args: ["occurred_at", { ascending: false }] },
      { method: "await", args: [] },
    ]);
  });

  test("null データは空配列になる", async () => {
    sb.enqueue("consumption_logs", { data: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumptionLogs("item-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("取得エラーはメッセージ付きで isError になる", async () => {
    sb.enqueue("consumption_logs", { error: { message: "logs failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useConsumptionLogs("item-1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("logs failed");
  });
});
