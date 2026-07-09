import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";
import type { Category, StorageLocation } from "@/types/item";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const {
  checkCategoryUsage,
  checkLocationUsage,
  useCategories,
  useCreateCategory,
  useCreateStorageLocation,
  useDeleteCategory,
  useDeleteStorageLocation,
  useStorageLocations,
  useUpdateCategory,
  useUpdateStorageLocation,
} = await import("@/hooks/useMasterData");

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "cat-1",
  user_id: "user-1",
  name: "食品",
  color: null,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeLocation = (overrides: Partial<StorageLocation> = {}): StorageLocation => ({
  id: "loc-1",
  user_id: "user-1",
  name: "冷蔵庫",
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useCategories / useStorageLocations", () => {
  test("カテゴリ一覧を取得する", async () => {
    const categories = [makeCategory()];
    sb.enqueue("categories", { data: categories });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(categories);
  });

  test("カテゴリ取得エラーで isError になる", async () => {
    sb.enqueue("categories", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  test("保管場所一覧を取得する (null データは空配列)", async () => {
    sb.enqueue("storage_locations", { data: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useStorageLocations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("保管場所取得エラーで isError になる", async () => {
    sb.enqueue("storage_locations", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useStorageLocations(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateCategory", () => {
  test("作成成功でキャッシュへソート挿入する", async () => {
    const created = makeCategory({ id: "cat-2", name: "あたらしい" });
    sb.enqueue("categories", { data: created });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["categories"], [makeCategory({ id: "cat-1", name: "んの最後" })]);

    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "あたらしい" });
    });

    const cache = queryClient.getQueryData<Category[]>(["categories"]);
    expect(cache?.map((category) => category.id)).toEqual(["cat-2", "cat-1"]);
  });

  test("キャッシュが空なら新規配列を作る / 重複 id は追加しない", async () => {
    const created = makeCategory({ id: "cat-2" });
    sb.enqueue("categories", { data: created }, { data: created });

    const { wrapper, queryClient } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "食品" });
    });
    expect(queryClient.getQueryData<Category[]>(["categories"])).toEqual([created]);

    await act(async () => {
      await result.current.mutateAsync({ name: "食品" });
    });
    expect(queryClient.getQueryData<Category[]>(["categories"])).toEqual([created]);
  });

  test("一意制約違反 (23505) は既存カテゴリを返す", async () => {
    const existing = makeCategory({ id: "cat-existing" });
    sb.enqueue(
      "categories",
      { error: { message: "duplicate", code: "23505" } },
      { data: existing },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    let value: Category | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({ name: "食品" });
    });

    expect(value?.id).toBe("cat-existing");
  });

  test("23505 後の既存検索が失敗したら throw する", async () => {
    sb.enqueue(
      "categories",
      { error: { message: "duplicate", code: "23505" } },
      { error: { message: "find failed" } },
    );

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "食品" })).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("その他のエラーは error トーストを出す", async () => {
    sb.enqueue("categories", { error: { message: "insert failed", code: "500" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "食品" })).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "食品" })).rejects.toThrow(
        "Not authenticated",
      );
    });
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "食品" })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("useUpdateCategory / useDeleteCategory", () => {
  test("更新成功でキャッシュを無効化する", async () => {
    sb.enqueue("categories", { data: makeCategory({ name: "更新" }) });

    const { wrapper, queryClient } = createHookWrapper();
    const invalidateSpy = mock(() => Promise.resolve());
    queryClient.invalidateQueries =
      invalidateSpy as unknown as typeof queryClient.invalidateQueries;

    const { result } = renderHook(() => useUpdateCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "cat-1", name: "更新", color: "#fff" });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });

  test("更新エラーで error トーストを出す", async () => {
    sb.enqueue("categories", { error: { message: "update failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: "cat-1", name: "x" })).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("削除成功で categories/items キャッシュを無効化する", async () => {
    sb.enqueue("categories", { error: null });

    const { wrapper, queryClient } = createHookWrapper();
    const invalidateSpy = mock(() => Promise.resolve());
    queryClient.invalidateQueries =
      invalidateSpy as unknown as typeof queryClient.invalidateQueries;

    const { result } = renderHook(() => useDeleteCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("cat-1");
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  test("削除エラーで error トーストを出す", async () => {
    sb.enqueue("categories", { error: { message: "delete failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useDeleteCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("cat-1")).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフライン削除で offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useDeleteCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("cat-1")).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("checkCategoryUsage / checkLocationUsage", () => {
  test("使用数を返す", async () => {
    sb.enqueue("items", { count: 3, error: null });
    expect(await checkCategoryUsage("cat-1")).toBe(3);
  });

  test("count が null なら 0 を返す", async () => {
    sb.enqueue("items", { count: null, error: null });
    expect(await checkCategoryUsage("cat-1")).toBe(0);
  });

  test("エラーは throw する", async () => {
    sb.enqueue("items", { error: { message: "count failed" } });
    await expect(checkCategoryUsage("cat-1")).rejects.toBeDefined();
  });

  test("保管場所の使用数を返す", async () => {
    sb.enqueue("items", { count: 5, error: null });
    expect(await checkLocationUsage("loc-1")).toBe(5);
  });

  test("保管場所のエラーは throw する", async () => {
    sb.enqueue("items", { error: { message: "count failed" } });
    await expect(checkLocationUsage("loc-1")).rejects.toBeDefined();
  });
});

describe("useCreateStorageLocation", () => {
  test("作成成功でキャッシュへソート挿入する", async () => {
    const created = makeLocation({ id: "loc-2", name: "アイス棚" });
    sb.enqueue("storage_locations", { data: created });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["locations"], [makeLocation({ id: "loc-1", name: "ん棚" })]);

    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("アイス棚");
    });

    const cache = queryClient.getQueryData<StorageLocation[]>(["locations"]);
    expect(cache?.map((location) => location.id)).toEqual(["loc-2", "loc-1"]);
  });

  test("一意制約違反 (23505) は既存を返す", async () => {
    const existing = makeLocation({ id: "loc-existing" });
    sb.enqueue(
      "storage_locations",
      { error: { message: "duplicate", code: "23505" } },
      { data: existing },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    let value: StorageLocation | undefined;
    await act(async () => {
      value = await result.current.mutateAsync("冷蔵庫");
    });

    expect(value?.id).toBe("loc-existing");
  });

  test("23505 後の既存検索が失敗したら throw する", async () => {
    sb.enqueue(
      "storage_locations",
      { error: { message: "duplicate", code: "23505" } },
      { error: { message: "find failed" } },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("冷蔵庫")).rejects.toBeDefined();
    });
  });

  test("その他のエラーは error トーストを出す", async () => {
    sb.enqueue("storage_locations", { error: { message: "insert failed", code: "500" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("冷蔵庫")).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("冷蔵庫")).rejects.toThrow("Not authenticated");
    });
  });
});

describe("useUpdateStorageLocation / useDeleteStorageLocation", () => {
  test("更新成功でキャッシュを無効化する", async () => {
    sb.enqueue("storage_locations", { data: makeLocation({ name: "更新" }) });

    const { wrapper, queryClient } = createHookWrapper();
    const invalidateSpy = mock(() => Promise.resolve());
    queryClient.invalidateQueries =
      invalidateSpy as unknown as typeof queryClient.invalidateQueries;

    const { result } = renderHook(() => useUpdateStorageLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "loc-1", name: "更新" });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });

  test("更新エラーで error トーストを出す", async () => {
    sb.enqueue("storage_locations", { error: { message: "update failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: "loc-1", name: "x" })).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("削除成功で locations/items キャッシュを無効化する", async () => {
    sb.enqueue("storage_locations", { error: null });

    const { wrapper, queryClient } = createHookWrapper();
    const invalidateSpy = mock(() => Promise.resolve());
    queryClient.invalidateQueries =
      invalidateSpy as unknown as typeof queryClient.invalidateQueries;

    const { result } = renderHook(() => useDeleteStorageLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("loc-1");
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  test("削除エラーで error トーストを出す", async () => {
    sb.enqueue("storage_locations", { error: { message: "delete failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useDeleteStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("loc-1")).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフライン更新で offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: "loc-1", name: "x" })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});
