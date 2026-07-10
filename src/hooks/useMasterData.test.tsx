import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import i18n from "@/lib/i18n";
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

describe("Branch カバレッジ補完 (useMasterData)", () => {
  test("カテゴリ: 23505 後の既存検索が null なら元のエラーを throw する", async () => {
    sb.enqueue(
      "categories",
      { error: { message: "duplicate", code: "23505" } },
      { data: null, error: null },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "食品" })).rejects.toBeDefined();
    });
  });

  test("保管場所: 23505 後の既存検索が null なら元のエラーを throw する", async () => {
    sb.enqueue(
      "storage_locations",
      { error: { message: "duplicate", code: "23505" } },
      { data: null, error: null },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("冷蔵庫")).rejects.toBeDefined();
    });
  });

  test("オフラインでカテゴリ更新すると offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateCategory(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: "cat-1", name: "x" })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインで保管場所削除すると offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useDeleteStorageLocation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("loc-1")).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("checkLocationUsage: count が null なら 0", async () => {
    sb.enqueue("items", { count: null, error: null });
    expect(await checkLocationUsage("loc-1")).toBe(0);
  });

  test("保管場所作成: キャッシュ未初期化なら新規配列 / 重複 id は追加しない", async () => {
    const created = makeLocation({ id: "loc-new" });
    sb.enqueue("storage_locations", { data: created }, { data: created });

    const { wrapper, queryClient } = createHookWrapper();
    const { result } = renderHook(() => useCreateStorageLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("新しい棚");
    });
    expect(queryClient.getQueryData<StorageLocation[]>(["locations"])).toEqual([created]);

    await act(async () => {
      await result.current.mutateAsync("新しい棚");
    });
    expect(queryClient.getQueryData<StorageLocation[]>(["locations"])).toEqual([created]);
  });
});

describe("Mutation hardening (useMasterData): クエリ内容とトースト文言", () => {
  test("カテゴリ/保管場所の一覧取得は name 昇順で発行される", async () => {
    sb.enqueue("categories", { data: [] });
    sb.enqueue("storage_locations", { data: [] });

    const { wrapper } = createHookWrapper();
    const categories = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(categories.result.current.isSuccess).toBe(true));
    const locations = renderHook(() => useStorageLocations(), { wrapper });
    await waitFor(() => expect(locations.result.current.isSuccess).toBe(true));

    const expectedOps = [
      { method: "select", args: ["*"] },
      { method: "order", args: ["name", { ascending: true }] },
      { method: "await", args: [] },
    ];
    expect(sb.queriesFor("categories")[0]?.ops).toEqual(expectedOps);
    expect(sb.queriesFor("storage_locations")[0]?.ops).toEqual(expectedOps);
  });

  test("使用数チェックのクエリ内容を完全一致で検証する", async () => {
    sb.enqueue("items", { count: 1, error: null }, { count: 2, error: null });

    await checkCategoryUsage("cat-9");
    await checkLocationUsage("loc-9");

    expect(sb.queriesFor("items")[0]?.ops).toEqual([
      { method: "select", args: ["id", { count: "exact", head: true }] },
      { method: "eq", args: ["category_id", "cat-9"] },
      { method: "is", args: ["deleted_at", null] },
      { method: "await", args: [] },
    ]);
    expect(sb.queriesFor("items")[1]?.ops).toEqual([
      { method: "select", args: ["id", { count: "exact", head: true }] },
      { method: "eq", args: ["storage_location_id", "loc-9"] },
      { method: "is", args: ["deleted_at", null] },
      { method: "await", args: [] },
    ]);
  });

  test("作成/更新/削除のペイロードを検証する (カテゴリ)", async () => {
    sb.enqueue("categories", { data: makeCategory() }, { data: makeCategory() }, { error: null });

    const { wrapper } = createHookWrapper();

    const create = renderHook(() => useCreateCategory(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ name: "新規", color: "#123456" });
    });

    const update = renderHook(() => useUpdateCategory(), { wrapper });
    await act(async () => {
      await update.result.current.mutateAsync({ id: "cat-1", name: "更新" });
    });

    const remove = renderHook(() => useDeleteCategory(), { wrapper });
    await act(async () => {
      await remove.result.current.mutateAsync("cat-1");
    });

    const queries = sb.queriesFor("categories");
    expect(queries[0]?.ops[0]).toEqual({
      method: "insert",
      args: [{ name: "新規", color: "#123456", user_id: "user-1" }],
    });
    // 更新: name / color(null 補完) / updated_at
    const updateArg = queries[1]?.ops[0]?.args[0] as Record<string, unknown>;
    expect(queries[1]?.ops[0]?.method).toBe("update");
    expect(updateArg.name).toBe("更新");
    expect(updateArg.color).toBeNull();
    expect(typeof updateArg.updated_at).toBe("string");
    expect(queries[1]?.ops[1]).toEqual({ method: "eq", args: ["id", "cat-1"] });
    // 削除
    expect(queries[2]?.ops).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["id", "cat-1"] },
      { method: "await", args: [] },
    ]);
  });

  test("オフライン時の各 mutation は offlineError の文言でトーストする", async () => {
    setNavigatorOnline(false);
    const { wrapper, toastCalls } = createHookWrapper();

    const hooks = [
      renderHook(() => useCreateCategory(), { wrapper }).result,
      renderHook(() => useUpdateCategory(), { wrapper }).result,
      renderHook(() => useDeleteCategory(), { wrapper }).result,
      renderHook(() => useCreateStorageLocation(), { wrapper }).result,
      renderHook(() => useUpdateStorageLocation(), { wrapper }).result,
      renderHook(() => useDeleteStorageLocation(), { wrapper }).result,
    ];

    await act(async () => {
      await expect(hooks[0]!.current.mutateAsync({ name: "x" })).rejects.toThrow();
      await expect(hooks[1]!.current.mutateAsync({ id: "1", name: "x" })).rejects.toThrow();
      await expect(hooks[2]!.current.mutateAsync("1")).rejects.toThrow();
      await expect(hooks[3]!.current.mutateAsync("x")).rejects.toThrow();
      await expect(hooks[4]!.current.mutateAsync({ id: "1", name: "x" })).rejects.toThrow();
      await expect(hooks[5]!.current.mutateAsync("1")).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls).toHaveLength(6));
    for (const call of toastCalls) {
      expect(call.message).toBe(i18n.t("common:offlineError"));
      expect(call.variant).toBe("error");
    }
  });

  test("エラー時の各 mutation は unknownError の文言でトーストする", async () => {
    sb.enqueue(
      "categories",
      { error: { message: "e1", code: "500" } },
      { error: { message: "e2" } },
      { error: { message: "e3" } },
    );
    sb.enqueue(
      "storage_locations",
      { error: { message: "e4", code: "500" } },
      { error: { message: "e5" } },
      { error: { message: "e6" } },
    );

    const { wrapper, toastCalls } = createHookWrapper();

    const hooks = [
      renderHook(() => useCreateCategory(), { wrapper }).result,
      renderHook(() => useUpdateCategory(), { wrapper }).result,
      renderHook(() => useDeleteCategory(), { wrapper }).result,
      renderHook(() => useCreateStorageLocation(), { wrapper }).result,
      renderHook(() => useUpdateStorageLocation(), { wrapper }).result,
      renderHook(() => useDeleteStorageLocation(), { wrapper }).result,
    ];

    await act(async () => {
      await expect(hooks[0]!.current.mutateAsync({ name: "x" })).rejects.toBeDefined();
      await expect(hooks[1]!.current.mutateAsync({ id: "1", name: "x" })).rejects.toBeDefined();
      await expect(hooks[2]!.current.mutateAsync("1")).rejects.toBeDefined();
      await expect(hooks[3]!.current.mutateAsync("x")).rejects.toBeDefined();
      await expect(hooks[4]!.current.mutateAsync({ id: "1", name: "x" })).rejects.toBeDefined();
      await expect(hooks[5]!.current.mutateAsync("1")).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls).toHaveLength(6));
    for (const call of toastCalls) {
      expect(call.message).toBe(i18n.t("common:unknownError"));
      expect(call.variant).toBe("error");
    }
  });

  test("23505 のときだけ既存検索が name / user_id で発行される", async () => {
    const existing = makeCategory({ id: "existing" });
    sb.enqueue("categories", { error: { message: "dup", code: "23505" } }, { data: existing });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "重複" });
    });

    expect(sb.queriesFor("categories")[1]?.ops).toEqual([
      { method: "select", args: [] },
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "eq", args: ["name", "重複"] },
      { method: "single", args: [] },
    ]);
  });
});
