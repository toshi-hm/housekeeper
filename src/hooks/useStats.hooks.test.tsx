import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createHookWrapper, makeItem } from "@/test/testUtils";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { useCategoryStats, useExpiryDistribution, useMonthlyConsumption } =
  await import("@/hooks/useStats");

const makeCategory = (id: string, name: string) => ({
  id,
  user_id: "user-1",
  name,
  color: null,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  sb.reset();
});

describe("useCategoryStats", () => {
  test("アイテムとカテゴリからカテゴリ別集計を返す", async () => {
    sb.enqueue("items", {
      data: [
        makeItem({ id: "i-1", category_id: "cat-1" }),
        makeItem({ id: "i-2", category_id: "cat-1" }),
        makeItem({ id: "i-3", category_id: null }),
      ],
    });
    sb.enqueue("categories", { data: [makeCategory("cat-1", "食品")] });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCategoryStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.stats).toEqual([
      { categoryId: "cat-1", name: "食品", count: 2 },
      { categoryId: null, name: "__uncategorized__", count: 1 },
    ]);
  });

  test("items 取得エラーで isError になる", async () => {
    sb.enqueue("items", { error: { message: "items failed" } });
    sb.enqueue("categories", { data: [] });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCategoryStats(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.stats).toEqual([]);
  });

  test("categories 取得エラーでも isError になる", async () => {
    sb.enqueue("items", { data: [] });
    sb.enqueue("categories", { error: { message: "categories failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCategoryStats(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useExpiryDistribution", () => {
  test("期限ステータスの分布を返す (warningDays 指定)", async () => {
    sb.enqueue("items", {
      data: [
        makeItem({ id: "i-1", units: 1, expiry_date: "2000-01-01" }),
        makeItem({ id: "i-2", units: 1, expiry_date: null }),
      ],
    });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useExpiryDistribution(5), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.distribution).toEqual([
      { status: "expired", count: 1 },
      { status: "unknown", count: 1 },
    ]);
  });
});

describe("useMonthlyConsumption", () => {
  test("消費ログを occurred_at 昇順で取得して月次集計する", async () => {
    const now = new Date();
    const isoThisMonth = new Date(now.getFullYear(), now.getMonth(), 10, 12).toISOString();
    sb.enqueue("consumption_logs", {
      data: [
        { delta_amount: 100, delta_unit: "mL", occurred_at: isoThisMonth },
        { delta_amount: 50, delta_unit: "mL", occurred_at: isoThisMonth },
      ],
    });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useMonthlyConsumption(2), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[1]).toMatchObject({ total: 150, unit: "mL" });

    const [query] = sb.queriesFor("consumption_logs");
    expect(query?.ops).toEqual([
      { method: "select", args: ["delta_amount, delta_unit, occurred_at"] },
      { method: "order", args: ["occurred_at", { ascending: true }] },
      { method: "await", args: [] },
    ]);
  });

  test("既定では 6 ヶ月分を返す", async () => {
    sb.enqueue("consumption_logs", { data: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useMonthlyConsumption(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(6);
  });

  test("取得エラーはメッセージ付きで isError になる", async () => {
    sb.enqueue("consumption_logs", { error: { message: "logs failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useMonthlyConsumption(1), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
