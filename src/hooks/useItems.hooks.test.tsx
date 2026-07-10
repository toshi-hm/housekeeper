import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import i18n from "@/lib/i18n";
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

describe("Branch カバレッジ補完 (useItems)", () => {
  test("useItem: 取得エラーで isError になる", async () => {
    sb.enqueue("items", { error: { message: "single failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItem("item-err"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  test("useItemsWithExpiry: null データは空配列になる", async () => {
    sb.enqueue("items", { data: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useItemsWithExpiry(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("作成: 省略されたフィールドはデフォルト値で補完される", async () => {
    const created = makeItem({ id: "min-item" });
    sb.enqueue("items", { data: created });
    sb.enqueue("item_lots", { data: makeLot() });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        values: { name: "最小" } as unknown as Parameters<
          typeof result.current.mutateAsync
        >[0]["values"],
      });
    });

    const insertOp = sb.queriesFor("items")[0]?.ops[0];
    expect(insertOp?.args[0]).toMatchObject({
      units: 1,
      content_amount: 1,
      content_unit: "個",
      opened_remaining: null,
      minimum_stock: null,
    });
  });

  test("作成: opened_remaining / minimum_stock を指定できる", async () => {
    const created = makeItem({ id: "full-item" });
    sb.enqueue("items", { data: created });
    sb.enqueue("item_lots", { data: makeLot() });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        values: {
          name: "指定あり",
          units: 2,
          content_amount: 3,
          content_unit: "g",
          opened_remaining: 0.5,
          minimum_stock: 4,
        },
      });
    });

    const insertOp = sb.queriesFor("items")[0]?.ops[0];
    expect(insertOp?.args[0]).toMatchObject({ opened_remaining: 0.5, minimum_stock: 4 });

    const lotInsert = sb.queriesFor("item_lots")[0]?.ops[0];
    expect(lotInsert?.args[0]).toMatchObject({ opened_remaining: 0.5 });
  });

  test("バーコードあり: スタック先も復活対象もなければ新規 insert する", async () => {
    const created = makeItem({ id: "fresh-item", barcode: "4999" });
    // 1) スタック検索 null 2) 復活検索 null 3) insert
    sb.enqueue("items", { data: null }, { data: null }, { data: created });
    sb.enqueue("item_lots", { data: makeLot() });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        values: { name: "新規", barcode: "4999", units: 1, content_amount: 1, content_unit: "個" },
      });
    });

    expect(value?.id).toBe("fresh-item");
    expect(sb.queriesFor("items")).toHaveLength(3);
  });

  test("復活対象の検索エラーは throw する", async () => {
    sb.enqueue("items", { error: { message: "find failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          values: { name: "x", barcode: "1", units: 1, content_amount: 1, content_unit: "個" },
          forceNew: true,
        }),
      ).rejects.toBeDefined();
    });
  });

  test("復活の update エラーは throw する", async () => {
    const deleted = makeItem({ id: "rev", barcode: "1", deleted_at: "2026-06-01" });
    sb.enqueue("items", { data: deleted }, { error: { message: "revive failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          values: { name: "x", barcode: "1", units: 1, content_amount: 1, content_unit: "個" },
          forceNew: true,
        }),
      ).rejects.toBeDefined();
    });
  });

  test("更新: 削除済みになったアイテムは全リストキャッシュから除外される", async () => {
    const original = makeItem({ id: "item-1", expiry_date: "2026-08-01" });
    const softDeleted = makeItem({
      id: "item-1",
      expiry_date: "2026-08-01",
      deleted_at: "2026-07-01T00:00:00Z",
    });
    sb.enqueue("items", { data: softDeleted });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", {}, "created_at"], [original]);
    queryClient.setQueryData(["items", "with-expiry"], [original]);

    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "削除済み" });
    });

    expect(queryClient.getQueryData<Item[]>(["items", {}, "created_at"])).toEqual([]);
    expect(queryClient.getQueryData<Item[]>(["items", "with-expiry"])).toEqual([]);
  });

  test("更新: 保管場所フィルタ不一致 / purchase_date ソート / 文字列キーのキャッシュ", async () => {
    const updated = makeItem({ id: "item-1", purchase_date: "2026-06-01" });
    sb.enqueue("items", { data: updated });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(
      ["items", { storageLocationId: "loc-x" }, "created_at"],
      [makeItem({ id: "item-1" })],
    );
    queryClient.setQueryData(["items", {}, "purchase_date"], []);
    queryClient.setQueryData(["items", "custom-key", "created_at"], []);

    const { result } = renderHook(() => useUpdateItem("item-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ purchase_date: "2026-06-01" });
    });

    // 保管場所フィルタに一致しない → 除外
    expect(
      queryClient.getQueryData<Item[]>(["items", { storageLocationId: "loc-x" }, "created_at"]),
    ).toEqual([]);
    // purchase_date ソートのリストへ upsert
    expect(
      queryClient.getQueryData<Item[]>(["items", {}, "purchase_date"])?.map((item) => item.id),
    ).toEqual(["item-1"]);
    // オブジェクトでないフィルタキーは空フィルタとして扱われ upsert
    expect(
      queryClient
        .getQueryData<Item[]>(["items", "custom-key", "created_at"])
        ?.map((item) => item.id),
    ).toEqual(["item-1"]);
  });
});

describe("Mutation hardening (useItems): クエリ内容とトースト文言の厳密検証", () => {
  test("fetchItems: フィルタ付きクエリの発行内容を完全一致で検証する", async () => {
    sb.enqueue("items", { data: [] });

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

    expect(sb.queriesFor("items")[0]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "is", args: ["deleted_at", null] },
      { method: "or", args: ["name.ilike.%milk%,barcode.ilike.%milk%"] },
      { method: "eq", args: ["category_id", "cat-1"] },
      { method: "eq", args: ["storage_location_id", "loc-1"] },
      { method: "order", args: ["expiry_date", { ascending: true, nullsFirst: false }] },
      { method: "await", args: [] },
    ]);
  });

  test("fetchItem / fetchItemsWithExpiry のクエリ内容を完全一致で検証する", async () => {
    sb.enqueue("items", { data: makeItem({ id: "item-9" }) });
    sb.enqueue("items", { data: [] });

    const { wrapper } = createHookWrapper();
    const single = renderHook(() => useItem("item-9"), { wrapper });
    await waitFor(() => expect(single.result.current.isSuccess).toBe(true));

    const withExpiry = renderHook(() => useItemsWithExpiry(), { wrapper });
    await waitFor(() => expect(withExpiry.result.current.isSuccess).toBe(true));

    expect(sb.queriesFor("items")[0]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["id", "item-9"] },
      { method: "single", args: [] },
    ]);
    expect(sb.queriesFor("items")[1]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "is", args: ["deleted_at", null] },
      { method: "not", args: ["expiry_date", "is", null] },
      { method: "order", args: ["expiry_date", { ascending: true }] },
      { method: "await", args: [] },
    ]);
  });

  test("作成: insert ペイロードを完全一致で検証する", async () => {
    const created = makeItem({ id: "exact-item" });
    // forceNew: 1) 復活検索 (null) 2) insert
    sb.enqueue("items", { data: null }, { data: created });
    sb.enqueue("item_lots", { data: makeLot() });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        values: {
          name: "厳密検証",
          barcode: "4901111111111",
          units: 2,
          content_amount: 3,
          content_unit: "g",
          opened_remaining: 1.5,
          purchase_date: "2026-06-01",
          expiry_date: "2026-12-31",
          notes: "備考",
          image_path: "u/p.jpg",
          minimum_stock: 2,
        },
        forceNew: true,
      });
    });

    // forceNew でも復活検索は走る (maybeSingle) → 2 番目が insert
    const insertQuery = sb.queriesFor("items").find((query) => query.ops[0]?.method === "insert");
    expect(insertQuery?.ops[0]?.args[0]).toEqual({
      name: "厳密検証",
      barcode: "4901111111111",
      category_id: null,
      storage_location_id: null,
      units: 2,
      content_amount: 3,
      content_unit: "g",
      opened_remaining: 1.5,
      purchase_date: "2026-06-01",
      expiry_date: "2026-12-31",
      notes: "備考",
      image_path: "u/p.jpg",
      minimum_stock: 2,
      user_id: "user-1",
    });
    expect(insertQuery?.ops.slice(1)).toEqual([
      { method: "select", args: [] },
      { method: "single", args: [] },
    ]);
  });

  test("バーコードのスタック/復活検索クエリを完全一致で検証する", async () => {
    sb.enqueue("items", { data: null }, { data: null }, { data: makeItem({ id: "n" }) });
    sb.enqueue("item_lots", { data: makeLot() });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useCreateItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        values: { name: "x", barcode: "4909", units: 1, content_amount: 1, content_unit: "個" },
      });
    });

    const queries = sb.queriesFor("items");
    // スタック先検索
    expect(queries[0]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "eq", args: ["barcode", "4909"] },
      { method: "is", args: ["deleted_at", null] },
      { method: "limit", args: [1] },
      { method: "maybeSingle", args: [] },
    ]);
    // 復活対象検索
    expect(queries[1]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "eq", args: ["barcode", "4909"] },
      { method: "not", args: ["deleted_at", "is", null] },
      { method: "limit", args: [1] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  test("更新: purchase_date ソートのキャッシュは購入日降順の位置へ挿入される", async () => {
    const itemB = makeItem({
      id: "b",
      purchase_date: "2026-06-05",
      created_at: "2026-01-02T00:00:00Z",
    });
    const itemA = makeItem({
      id: "a",
      purchase_date: "2026-06-01",
      created_at: "2026-01-03T00:00:00Z",
    });
    const updatedC = makeItem({
      id: "c",
      purchase_date: "2026-06-03",
      created_at: "2026-01-10T00:00:00Z",
    });
    sb.enqueue("items", { data: updatedC });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", {}, "purchase_date"], [itemB, itemA]);

    const { result } = renderHook(() => useUpdateItem("c"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ purchase_date: "2026-06-03" });
    });

    // created_at ソートだと c が先頭に来てしまう。購入日降順なら b → c → a。
    expect(
      queryClient.getQueryData<Item[]>(["items", {}, "purchase_date"])?.map((item) => item.id),
    ).toEqual(["b", "c", "a"]);
  });

  test("更新: with-expiry キャッシュは期限昇順の位置へ挿入される", async () => {
    const itemX = makeItem({
      id: "x",
      expiry_date: "2026-08-01",
      created_at: "2026-01-05T00:00:00Z",
    });
    const itemY = makeItem({
      id: "y",
      expiry_date: "2026-09-01",
      created_at: "2026-01-01T00:00:00Z",
    });
    const updatedZ = makeItem({
      id: "z",
      expiry_date: "2026-08-15",
      created_at: "2026-01-10T00:00:00Z",
    });
    sb.enqueue("items", { data: updatedZ });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", "with-expiry"], [itemX, itemY]);

    const { result } = renderHook(() => useUpdateItem("z"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ expiry_date: "2026-08-15" });
    });

    expect(
      queryClient.getQueryData<Item[]>(["items", "with-expiry"])?.map((item) => item.id),
    ).toEqual(["x", "z", "y"]);
  });

  test("更新: 除外時も他のアイテムはキャッシュに残る", async () => {
    const other = makeItem({ id: "other", storage_location_id: "loc-x" });
    const softDeleted = makeItem({ id: "target", deleted_at: "2026-07-01T00:00:00Z" });
    sb.enqueue("items", { data: softDeleted });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(["items", {}, "created_at"], [makeItem({ id: "target" }), other]);
    queryClient.setQueryData(
      ["items", { storageLocationId: "loc-x" }, "created_at"],
      [makeItem({ id: "target" }), other],
    );

    const { result } = renderHook(() => useUpdateItem("target"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "削除" });
    });

    expect(
      queryClient.getQueryData<Item[]>(["items", {}, "created_at"])?.map((item) => item.id),
    ).toEqual(["other"]);
    expect(
      queryClient
        .getQueryData<Item[]>(["items", { storageLocationId: "loc-x" }, "created_at"])
        ?.map((item) => item.id),
    ).toEqual(["other"]);
  });

  test("オフライン時は各 mutation が offlineError の文言でトーストする", async () => {
    setNavigatorOnline(false);
    const { wrapper, toastCalls } = createHookWrapper();

    const create = renderHook(() => useCreateItem(), { wrapper });
    await act(async () => {
      await expect(
        create.result.current.mutateAsync({
          values: { name: "x", units: 1, content_amount: 1, content_unit: "個" },
        }),
      ).rejects.toThrow();
    });

    const update = renderHook(() => useUpdateItem("item-1"), { wrapper });
    await act(async () => {
      await expect(update.result.current.mutateAsync({ name: "x" })).rejects.toThrow();
    });

    const softDelete = renderHook(() => useSoftDeleteItem(), { wrapper });
    await act(async () => {
      await expect(softDelete.result.current.mutateAsync("item-1")).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls).toHaveLength(3));
    for (const call of toastCalls) {
      expect(call.message).toBe(i18n.t("common:offlineError"));
      expect(call.variant).toBe("error");
    }
  });

  test("その他エラー時は unknownError の文言でトーストする", async () => {
    sb.enqueue(
      "items",
      { error: { message: "e1" } },
      { error: { message: "e2" } },
      {
        error: { message: "e3" },
      },
    );
    const { wrapper, toastCalls } = createHookWrapper();

    const create = renderHook(() => useCreateItem(), { wrapper });
    await act(async () => {
      await expect(
        create.result.current.mutateAsync({
          values: { name: "x", units: 1, content_amount: 1, content_unit: "個" },
        }),
      ).rejects.toBeDefined();
    });

    const update = renderHook(() => useUpdateItem("item-1"), { wrapper });
    await act(async () => {
      await expect(update.result.current.mutateAsync({ name: "x" })).rejects.toBeDefined();
    });

    const softDelete = renderHook(() => useSoftDeleteItem(), { wrapper });
    await act(async () => {
      await expect(softDelete.result.current.mutateAsync("item-1")).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls).toHaveLength(3));
    for (const call of toastCalls) {
      expect(call.message).toBe(i18n.t("common:unknownError"));
      expect(call.variant).toBe("error");
    }
  });

  test("復活・ソフトデリートの success トースト文言を検証する", async () => {
    // 復活 (forceNew: スタック検索スキップ)
    const deleted = makeItem({ id: "rv", barcode: "1", deleted_at: "2026-06-01" });
    const revived = makeItem({ id: "rv", barcode: "1" });
    sb.enqueue("items", { data: deleted }, { data: revived }, { error: null });
    sb.enqueue("item_lots", { data: makeLot() }, { data: [] });

    const { wrapper, toastCalls } = createHookWrapper();
    const create = renderHook(() => useCreateItem(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({
        values: { name: "x", barcode: "1", units: 1, content_amount: 1, content_unit: "個" },
        forceNew: true,
      });
    });

    expect(toastCalls[0]).toEqual({
      message: i18n.t("calendar:reviveSuccess"),
      variant: "success",
    });

    sb.enqueue("items", { error: null });
    const softDelete = renderHook(() => useSoftDeleteItem(), { wrapper });
    await act(async () => {
      await softDelete.result.current.mutateAsync("item-1");
    });

    expect(toastCalls[1]).toEqual({
      message: i18n.t("calendar:softDeleteSuccess"),
      variant: "success",
    });
  });
});
