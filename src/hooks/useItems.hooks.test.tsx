import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper, makeItem, makeLot } from "@/test/testUtils";
import type { Item } from "@/types/item";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const {
  findActiveItemByBarcode,
  useCreateItem,
  useItem,
  useItems,
  useItemsWithExpiry,
  useSoftDeleteItem,
  useUpdateItem,
} = await import("@/hooks/useItems");

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useItems", () => {
  test("フィルタとソートを適用して一覧を取得する", async () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    sb.enqueue("items", { data: items });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(
      () =>
        useItems(
          { search: "milk", categoryId: "cat-1", storageLocationId: "loc-1" },
          "expiry_date",
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(items);

    const [query] = sb.queriesFor("items");
    const methods = query?.ops.map((op) => op.method);
    expect(methods).toContain("or");
    expect(methods?.filter((m) => m === "eq")).toHaveLength(2);
    const orderOp = query?.ops.find((op) => op.method === "order");
    expect(orderOp?.args[0]).toBe("expiry_date");
  });

  test("フィルタなしはソートキーの降順で取得する", async () => {
    sb.enqueue("items", { data: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);

    const [query] = sb.queriesFor("items");
    const orderOp = query?.ops.find((op) => op.method === "order");
    expect(orderOp?.args[0]).toBe("created_at");
    expect(orderOp?.args[1]).toEqual({ ascending: false });
  });

  test("取得エラーで isError になる", async () => {
    sb.enqueue("items", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItems(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useItem", () => {
  test("ID 指定で単一アイテムを取得する", async () => {
    const item = makeItem({ id: "item-9" });
    sb.enqueue("items", { data: item });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItem("item-9"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(item);
  });

  test("id が空のときはクエリを実行しない", async () => {
    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItem(""), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(sb.queriesFor("items")).toHaveLength(0);
  });
});

describe("useItemsWithExpiry", () => {
  test("期限付きアイテムのみ取得する", async () => {
    const item = makeItem({ expiry_date: "2026-08-01" });
    sb.enqueue("items", { data: [item] });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItemsWithExpiry(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([item]);

    const [query] = sb.queriesFor("items");
    expect(query?.ops.map((op) => op.method)).toContain("not");
  });

  test("取得エラーで isError になる", async () => {
    sb.enqueue("items", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItemsWithExpiry(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateItem", () => {
  test("バーコードなし → 新規 insert + ロット作成", async () => {
    const created = makeItem({ id: "new-item", name: "新規" });
    sb.enqueue("items", { data: created });
    sb.enqueue("item_lots", { data: makeLot({ item_id: "new-item" }) });

    const { wrapper, queryClient } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        values: { name: "新規", units: 1, content_amount: 1, content_unit: "個" },
      });
    });

    expect(value?.id).toBe("new-item");
    expect(queryClient.getQueryData(["items", "new-item"])).toEqual(created);

    const itemQueries = sb.queriesFor("items");
    expect(itemQueries[0]?.ops[0]?.method).toBe("insert");
    expect(sb.queriesFor("item_lots")).toHaveLength(1);
  });

  test("バーコード一致するアクティブアイテムへスタックする", async () => {
    const active = makeItem({ id: "stack-item", barcode: "4900000000001", units: 1 });
    const updated = makeItem({ id: "stack-item", barcode: "4900000000001", units: 3 });
    // 1) スタック先検索 (maybeSingle) 2) syncItemAggregate の items 更新 3) 再取得 (single)
    sb.enqueue("items", { data: active }, { error: null }, { data: updated });
    // 1) createLot insert 2) syncItemAggregate の lots 集計
    sb.enqueue(
      "item_lots",
      { data: makeLot() },
      { data: [{ units: 3, expiry_date: null, opened_remaining: null }] },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    let value: (Item & { _stacked?: boolean }) | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        values: {
          name: "スタック",
          barcode: "4900000000001",
          units: 2,
          content_amount: 1,
          content_unit: "個",
        },
      });
    });

    expect(value?._stacked).toBe(true);
    expect(value?.units).toBe(3);
  });

  test("ソフトデリート済みアイテムを復活させ success トーストを出す", async () => {
    const deleted = makeItem({
      id: "revive-item",
      barcode: "4900000000002",
      deleted_at: "2026-06-01T00:00:00Z",
    });
    const revived = makeItem({ id: "revive-item", barcode: "4900000000002" });
    // forceNew: スタック検索をスキップ → 1) 復活対象検索 2) update().single()
    // 3) syncItemAggregate の items 更新
    sb.enqueue("items", { data: deleted }, { data: revived }, { error: null });
    sb.enqueue(
      "item_lots",
      { data: makeLot() },
      { data: [{ units: 1, expiry_date: "2026-09-01", opened_remaining: 0.5 }] },
    );

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    let value: (Item & { _revived?: boolean }) | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        values: {
          name: "復活",
          barcode: "4900000000002",
          units: 1,
          content_amount: 1,
          content_unit: "個",
        },
        forceNew: true,
      });
    });

    expect(value?._revived).toBe(true);
    expect(toastCalls.some((call) => call.variant === "success")).toBe(true);
  });

  test("未認証ならエラーになり error トーストを出す", async () => {
    sb.setUser(null);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          values: { name: "x", units: 1, content_amount: 1, content_unit: "個" },
        }),
      ).rejects.toThrow("Not authenticated");
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインなら OfflineError トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          values: { name: "x", units: 1, content_amount: 1, content_unit: "個" },
        }),
      ).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("insert エラーで mutation が失敗する", async () => {
    sb.enqueue("items", { error: { message: "insert failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          values: { name: "x", units: 1, content_amount: 1, content_unit: "個" },
        }),
      ).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("useUpdateItem", () => {
  test("更新成功でリスト/単一/with-expiry キャッシュを整合させる", async () => {
    const original = makeItem({ id: "item-1", expiry_date: "2026-08-01" });
    const other = makeItem({ id: "item-2", expiry_date: "2026-09-01" });
    const updated = makeItem({ id: "item-1", name: "更新済み", expiry_date: "2026-08-15" });
    sb.enqueue("items", { data: updated });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", {}, "created_at"], [original, other]);
    queryClient.setQueryData(["items", "with-expiry"], [original, other]);
    queryClient.setQueryData(["items", { categoryId: "food" }, "created_at"], [original]);
    queryClient.setQueryData(["items", "item-1"], original);

    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "更新済み" });
    });

    expect(queryClient.getQueryData<Item>(["items", "item-1"])?.name).toBe("更新済み");

    const listCache = queryClient.getQueryData<Item[]>(["items", {}, "created_at"]);
    expect(listCache?.find((item) => item.id === "item-1")?.name).toBe("更新済み");

    const withExpiry = queryClient.getQueryData<Item[]>(["items", "with-expiry"]);
    expect(withExpiry?.map((item) => item.id)).toEqual(["item-1", "item-2"]);

    // categoryId フィルタに一致しないため除外される
    const filtered = queryClient.getQueryData<Item[]>([
      "items",
      { categoryId: "food" },
      "created_at",
    ]);
    expect(filtered).toEqual([]);
  });

  test("expiry_date が消えたら with-expiry キャッシュから除外する", async () => {
    const original = makeItem({ id: "item-1", expiry_date: "2026-08-01" });
    const updated = makeItem({ id: "item-1", expiry_date: null });
    sb.enqueue("items", { data: updated });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", "with-expiry"], [original]);

    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expiry_date: "" });
    });

    expect(queryClient.getQueryData<Item[]>(["items", "with-expiry"])).toEqual([]);
  });

  test("検索フィルタに一致するキャッシュは upsert される", async () => {
    const updated = makeItem({ id: "item-1", name: "ミルクティー" });
    sb.enqueue("items", { data: updated });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", { search: "ミルク" }, "created_at"], []);
    queryClient.setQueryData(["items", { search: "コーヒー" }, "created_at"], []);

    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "ミルクティー" });
    });

    const matched = queryClient.getQueryData<Item[]>(["items", { search: "ミルク" }, "created_at"]);
    expect(matched?.map((item) => item.id)).toEqual(["item-1"]);

    const unmatched = queryClient.getQueryData<Item[]>([
      "items",
      { search: "コーヒー" },
      "created_at",
    ]);
    expect(unmatched).toEqual([]);
  });

  test("更新エラーで error トーストを出す", async () => {
    sb.enqueue("items", { error: { message: "update failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "x" })).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインなら offlineError トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "x" })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("useSoftDeleteItem", () => {
  test("成功で success トーストを出す", async () => {
    sb.enqueue("items", { error: null });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useSoftDeleteItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("item-1");
    });

    expect(toastCalls.some((call) => call.variant === "success")).toBe(true);

    const [query] = sb.queriesFor("items");
    expect(query?.ops[0]?.method).toBe("update");
  });

  test("削除エラーで error トーストを出す", async () => {
    sb.enqueue("items", { error: { message: "delete failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useSoftDeleteItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("item-1")).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインなら error トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useSoftDeleteItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("item-1")).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("findActiveItemByBarcode", () => {
  test("一致するアイテムを返す", async () => {
    const item = makeItem({ barcode: "490" });
    sb.enqueue("items", { data: item });

    const found = await findActiveItemByBarcode("490");
    expect(found).toEqual(item);
  });

  test("一致しなければ null を返す", async () => {
    sb.enqueue("items", { data: null });

    const found = await findActiveItemByBarcode("490");
    expect(found).toBeNull();
  });

  test("エラーは throw する", async () => {
    sb.enqueue("items", { error: { message: "lookup failed" } });

    await expect(findActiveItemByBarcode("490")).rejects.toBeDefined();
  });
});
