import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import i18n from "@/lib/i18n";
import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper, makeItem, makeLot } from "@/test/testUtils";
import type { Item, ItemFormValues } from "@/types/item";
import type { ShoppingItem } from "@/types/shopping";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const {
  useDeleteAllPurchasedItems,
  useDeleteShoppingItem,
  usePurchaseShoppingItem,
  useShoppingList,
  useUpsertShoppingItem,
} = await import("@/hooks/useShoppingList");

const makeShoppingItem = (overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: "shop-1",
  user_id: "user-1",
  name: "牛乳",
  desired_units: 1,
  note: null,
  linked_item_id: null,
  status: "planned",
  purchased_at: null,
  created_item_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeFormValues = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  name: "牛乳",
  barcode: "",
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: "",
  expiry_date: "",
  notes: "",
  image_path: "",
  ...overrides,
});

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useShoppingList", () => {
  test("ステータスで絞り込んで一覧を取得する", async () => {
    const rows = [makeShoppingItem()];
    sb.enqueue("shopping_list_items", { data: rows });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useShoppingList("planned"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);

    const [query] = sb.queriesFor("shopping_list_items");
    const eqOp = query?.ops.find((op) => op.method === "eq");
    expect(eqOp?.args).toEqual(["status", "planned"]);
  });

  test("取得エラーで isError になる", async () => {
    sb.enqueue("shopping_list_items", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useShoppingList(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpsertShoppingItem", () => {
  test("user_id 付きで upsert する", async () => {
    const row = makeShoppingItem({ name: "パン" });
    sb.enqueue("shopping_list_items", { data: row });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpsertShoppingItem(), { wrapper });

    let value: unknown;
    await act(async () => {
      value = await result.current.mutateAsync({ name: "パン" });
    });

    expect(value).toEqual(row);

    const [query] = sb.queriesFor("shopping_list_items");
    const upsertOp = query?.ops.find((op) => op.method === "upsert");
    expect(upsertOp?.args[0]).toMatchObject({
      user_id: "user-1",
      name: "パン",
      desired_units: 1,
      note: null,
      linked_item_id: null,
    });
  });

  test("未認証ならエラーになり error トーストを出す", async () => {
    sb.setUser(null);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpsertShoppingItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "パン" })).rejects.toThrow(
        "Not authenticated",
      );
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("upsert エラーは throw する", async () => {
    sb.enqueue("shopping_list_items", { error: { message: "upsert failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpsertShoppingItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "パン" })).rejects.toThrow("upsert failed");
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpsertShoppingItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "パン" })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("useDeleteShoppingItem", () => {
  test("楽観的にキャッシュから除去し、成功で確定する", async () => {
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper, queryClient } = createHookWrapper();
    queryClient.setQueryData(
      ["shopping", "planned"],
      [makeShoppingItem({ id: "shop-1" }), makeShoppingItem({ id: "shop-2" })],
    );

    const { result } = renderHook(() => useDeleteShoppingItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("shop-1");
    });

    const cache = queryClient.getQueryData<ShoppingItem[]>(["shopping", "planned"]);
    expect(cache?.map((row) => row.id)).toEqual(["shop-2"]);
  });

  test("失敗時はスナップショットへロールバックする", async () => {
    sb.enqueue("shopping_list_items", { error: { message: "delete failed" } });

    const { wrapper, queryClient, toastCalls } = createHookWrapper();
    const rows = [makeShoppingItem({ id: "shop-1" }), makeShoppingItem({ id: "shop-2" })];
    queryClient.setQueryData(["shopping", "planned"], rows);

    const { result } = renderHook(() => useDeleteShoppingItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("shop-1")).rejects.toThrow("delete failed");
    });

    const cache = queryClient.getQueryData<ShoppingItem[]>(["shopping", "planned"]);
    expect(cache?.map((row) => row.id)).toEqual(["shop-1", "shop-2"]);
    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインならロールバックして offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, queryClient, toastCalls } = createHookWrapper();
    queryClient.setQueryData(["shopping", "planned"], [makeShoppingItem({ id: "shop-1" })]);

    const { result } = renderHook(() => useDeleteShoppingItem(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("shop-1")).rejects.toThrow();
    });

    const cache = queryClient.getQueryData<ShoppingItem[]>(["shopping", "planned"]);
    expect(cache).toHaveLength(1);
    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("useDeleteAllPurchasedItems", () => {
  test("purchased をまとめて削除する", async () => {
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeleteAllPurchasedItems(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    const [query] = sb.queriesFor("shopping_list_items");
    expect(query?.ops[0]?.method).toBe("delete");
    const eqOps = query?.ops.filter((op) => op.method === "eq");
    expect(eqOps).toHaveLength(2);
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeleteAllPurchasedItems(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("Not authenticated");
    });
  });

  test("削除エラーで error トーストを出す", async () => {
    sb.enqueue("shopping_list_items", { error: { message: "delete failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useDeleteAllPurchasedItems(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("delete failed");
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useDeleteAllPurchasedItems(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("usePurchaseShoppingItem", () => {
  test("バーコード一致するアクティブアイテムにスタックする", async () => {
    const active = makeItem({ id: "item-active", barcode: "4901" });
    // 1) アクティブ検索 maybeSingle 2) syncItemAggregate の items 更新
    sb.enqueue("items", { data: active }, { error: null });
    // 1) createLot insert 2) sync の lots 集計
    sb.enqueue("item_lots", { data: makeLot() }, { data: [] });
    // markShoppingItemPurchased
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        shoppingItemId: "shop-1",
        itemValues: makeFormValues({ barcode: "4901" }),
      });
    });

    expect(value?.id).toBe("item-active");

    const shoppingQueries = sb.queriesFor("shopping_list_items");
    expect(shoppingQueries[0]?.ops[0]?.method).toBe("update");
  });

  test("ソフトデリート済みアイテムを復活させる", async () => {
    const deleted = makeItem({ id: "item-del", barcode: "4902", deleted_at: "2026-06-01" });
    const revived = makeItem({ id: "item-del", barcode: "4902" });
    // 1) アクティブ検索 null 2) 削除済み検索 3) 復活 update single 4) sync items 更新
    sb.enqueue("items", { data: null }, { data: deleted }, { data: revived }, { error: null });
    sb.enqueue("item_lots", { data: makeLot() }, { data: [] });
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        shoppingItemId: "shop-1",
        itemValues: makeFormValues({ barcode: "4902" }),
      });
    });

    expect(value?.id).toBe("item-del");
    expect(value?.deleted_at).toBeNull();
  });

  test("復活の update が失敗したら throw する", async () => {
    const deleted = makeItem({ id: "item-del", barcode: "4902", deleted_at: "2026-06-01" });
    sb.enqueue("items", { data: null }, { data: deleted }, { error: { message: "revive failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          shoppingItemId: "shop-1",
          itemValues: makeFormValues({ barcode: "4902" }),
        }),
      ).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("バーコードなし → 新規アイテムを作成して購入済みにする", async () => {
    const newItem = makeItem({ id: "item-new", name: "牛乳" });
    // 1) created_item_id 予約確認 2) 予約 update 3) 購入済み update
    sb.enqueue(
      "shopping_list_items",
      { data: { created_item_id: null } },
      { error: null },
      { error: null },
    );
    // items upsert single, sync items 更新
    sb.enqueue("items", { data: newItem }, { error: null });
    // 1) 既存ロット確認 (なし) 2) createLot insert 3) sync lots 集計
    sb.enqueue("item_lots", { data: [] }, { data: makeLot() }, { data: [] });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        shoppingItemId: "shop-1",
        itemValues: makeFormValues(),
      });
    });

    expect(value?.id).toBe("item-new");

    // 予約 → 購入済みマークの 2 回 update + 予約確認 select
    const shoppingQueries = sb.queriesFor("shopping_list_items");
    expect(shoppingQueries).toHaveLength(3);
  });

  test("リトライ時 (created_item_id あり・ロット作成済み) は重複作成しない", async () => {
    const newItem = makeItem({ id: "item-reserved" });
    // 1) 予約確認 (予約済み) 2) 購入済み update
    sb.enqueue(
      "shopping_list_items",
      { data: { created_item_id: "item-reserved" } },
      {
        error: null,
      },
    );
    sb.enqueue("items", { data: newItem }, { error: null });
    // 既存ロットあり → createLot はスキップ、sync 集計のみ
    sb.enqueue(
      "item_lots",
      { data: [{ id: "lot-1" }] },
      { data: [{ units: 1, expiry_date: null, opened_remaining: null }] },
    );

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        shoppingItemId: "shop-1",
        itemValues: makeFormValues(),
      });
    });

    expect(value?.id).toBe("item-reserved");

    // item_lots への insert が発行されていないこと
    const lotInserts = sb
      .queriesFor("item_lots")
      .filter((query) => query.ops.some((op) => op.method === "insert"));
    expect(lotInserts).toHaveLength(0);
  });

  test("items upsert エラーは throw する", async () => {
    sb.enqueue("shopping_list_items", { data: { created_item_id: "item-x" } });
    sb.enqueue("items", { error: { message: "upsert failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          shoppingItemId: "shop-1",
          itemValues: makeFormValues(),
        }),
      ).rejects.toThrow("upsert failed");
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          shoppingItemId: "shop-1",
          itemValues: makeFormValues(),
        }),
      ).rejects.toThrow("Not authenticated");
    });
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          shoppingItemId: "shop-1",
          itemValues: makeFormValues(),
        }),
      ).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("Branch カバレッジ補完 (useShoppingList)", () => {
  test("一覧: null データは空配列になる", async () => {
    sb.enqueue("shopping_list_items", { data: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useShoppingList(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("楽観的削除: 配列でないキャッシュはそのまま維持される", async () => {
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper, queryClient } = createHookWrapper();
    const meta = { lastSync: "2026-07-01" };
    queryClient.setQueryData(["shopping", "meta"], meta);
    queryClient.setQueryData(["shopping", "planned"], [makeShoppingItem({ id: "shop-1" })]);

    const { result } = renderHook(() => useDeleteShoppingItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("shop-1");
    });

    expect(queryClient.getQueryData(["shopping", "meta"])).toEqual(meta);
    expect(queryClient.getQueryData(["shopping", "planned"])).toEqual([]);
  });

  test("購入: バーコード一致なし (アクティブ/削除済みとも null) なら新規作成する", async () => {
    const newItem = makeItem({ id: "item-barcode-new", barcode: "4950" });
    // 1) アクティブ検索 null 2) 削除済み検索 null 3) upsert 4) sync update
    sb.enqueue("items", { data: null }, { data: null }, { data: newItem }, { error: null });
    sb.enqueue(
      "shopping_list_items",
      { data: { created_item_id: null } },
      { error: null },
      { error: null },
    );
    sb.enqueue("item_lots", { data: [] }, { data: makeLot() }, { data: [] });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    let value: Item | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        shoppingItemId: "shop-1",
        itemValues: makeFormValues({ barcode: "4950" }),
      });
    });

    expect(value?.id).toBe("item-barcode-new");
  });

  test("購入: 任意フィールド未指定は null で upsert し、購入済みマーク失敗は throw する", async () => {
    const newItem = makeItem({ id: "item-partial" });
    sb.enqueue("items", { data: newItem }, { error: null });
    // 1) 予約確認 (予約済み) 2) markPurchased 失敗
    sb.enqueue(
      "shopping_list_items",
      { data: { created_item_id: "item-partial" } },
      { error: { message: "mark failed" } },
    );
    sb.enqueue("item_lots", { data: [{ id: "lot-1" }] }, { data: [] });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          shoppingItemId: "shop-1",
          itemValues: {
            name: "部分指定",
            units: 1,
            content_amount: 1,
            content_unit: "個",
          } as ItemFormValues,
        }),
      ).rejects.toThrow("mark failed");
    });

    const upsertOp = sb
      .queriesFor("items")
      .find((query) => query.ops.some((op) => op.method === "upsert"))
      ?.ops.find((op) => op.method === "upsert");
    expect(upsertOp?.args[0]).toMatchObject({
      barcode: null,
      category_id: null,
      storage_location_id: null,
      opened_remaining: null,
      purchase_date: null,
      expiry_date: null,
      notes: null,
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("Mutation hardening (useShoppingList): クエリ内容とトースト文言", () => {
  test("一覧取得のクエリ内容を完全一致で検証する", async () => {
    sb.enqueue("shopping_list_items", { data: [] });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useShoppingList("purchased"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sb.queriesFor("shopping_list_items")[0]?.ops).toEqual([
      { method: "select", args: ["*"] },
      { method: "eq", args: ["status", "purchased"] },
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "await", args: [] },
    ]);
  });

  test("upsert のペイロードとオプションを完全一致で検証する", async () => {
    sb.enqueue("shopping_list_items", { data: makeShoppingItem() });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpsertShoppingItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: "shop-9",
        name: "洗剤",
        desired_units: 3,
        note: "特売",
        linked_item_id: "item-9",
      });
    });

    expect(sb.queriesFor("shopping_list_items")[0]?.ops).toEqual([
      {
        method: "upsert",
        args: [
          {
            id: "shop-9",
            user_id: "user-1",
            name: "洗剤",
            desired_units: 3,
            note: "特売",
            linked_item_id: "item-9",
          },
          { onConflict: "id" },
        ],
      },
      { method: "select", args: [] },
      { method: "single", args: [] },
    ]);
  });

  test("購入済みマークの update ペイロードを検証する", async () => {
    const active = makeItem({ id: "item-active", barcode: "4901" });
    sb.enqueue("items", { data: active }, { error: null });
    sb.enqueue("item_lots", { data: makeLot() }, { data: [] });
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePurchaseShoppingItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        shoppingItemId: "shop-1",
        itemValues: makeFormValues({ barcode: "4901" }),
      });
    });

    const markQuery = sb.queriesFor("shopping_list_items")[0];
    const payload = markQuery?.ops[0]?.args[0] as Record<string, unknown>;
    expect(markQuery?.ops[0]?.method).toBe("update");
    expect(payload.status).toBe("purchased");
    expect(payload.created_item_id).toBe("item-active");
    expect(typeof payload.purchased_at).toBe("string");
    expect(markQuery?.ops[1]).toEqual({ method: "eq", args: ["id", "shop-1"] });
  });

  test("オフライン時の各 mutation は offlineError の文言でトーストする", async () => {
    setNavigatorOnline(false);
    const { wrapper, toastCalls } = createHookWrapper();

    const upsert = renderHook(() => useUpsertShoppingItem(), { wrapper }).result;
    const remove = renderHook(() => useDeleteShoppingItem(), { wrapper }).result;
    const removeAll = renderHook(() => useDeleteAllPurchasedItems(), { wrapper }).result;
    const purchase = renderHook(() => usePurchaseShoppingItem(), { wrapper }).result;

    await act(async () => {
      await expect(upsert.current.mutateAsync({ name: "x" })).rejects.toThrow();
      await expect(remove.current.mutateAsync("1")).rejects.toThrow();
      await expect(removeAll.current.mutateAsync()).rejects.toThrow();
      await expect(
        purchase.current.mutateAsync({ shoppingItemId: "1", itemValues: makeFormValues() }),
      ).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls).toHaveLength(4));
    for (const call of toastCalls) {
      expect(call.message).toBe(i18n.t("common:offlineError"));
      expect(call.variant).toBe("error");
    }
  });

  test("エラー時の各 mutation は unknownError の文言でトーストする", async () => {
    sb.enqueue(
      "shopping_list_items",
      { error: { message: "e1" } },
      { error: { message: "e2" } },
      { error: { message: "e3" } },
    );

    const { wrapper, toastCalls } = createHookWrapper();

    const upsert = renderHook(() => useUpsertShoppingItem(), { wrapper }).result;
    const remove = renderHook(() => useDeleteShoppingItem(), { wrapper }).result;
    const removeAll = renderHook(() => useDeleteAllPurchasedItems(), { wrapper }).result;

    await act(async () => {
      await expect(upsert.current.mutateAsync({ name: "x" })).rejects.toBeDefined();
      await expect(remove.current.mutateAsync("1")).rejects.toBeDefined();
      await expect(removeAll.current.mutateAsync()).rejects.toBeDefined();
    });

    await waitFor(() => expect(toastCalls).toHaveLength(3));
    for (const call of toastCalls) {
      expect(call.message).toBe(i18n.t("common:unknownError"));
      expect(call.variant).toBe("error");
    }
  });
});

describe("Mutation hardening 2 (useShoppingList)", () => {
  test("既定ステータスは planned で、キャッシュは [shopping, status] キーに載る", async () => {
    const rows = [makeShoppingItem()];
    sb.enqueue("shopping_list_items", { data: rows });

    const { wrapper, queryClient } = createHookWrapper();
    const { result } = renderHook(() => useShoppingList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sb.queriesFor("shopping_list_items")[0]?.ops[1]).toEqual({
      method: "eq",
      args: ["status", "planned"],
    });
    expect(queryClient.getQueryData(["shopping", "planned"])).toEqual(rows);
  });

  test("削除クエリの内容を完全一致で検証する", async () => {
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeleteShoppingItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("shop-7");
    });

    expect(sb.queriesFor("shopping_list_items")[0]?.ops).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["id", "shop-7"] },
      { method: "await", args: [] },
    ]);
  });

  test("全削除は user_id と status=purchased の両方で絞り込む", async () => {
    sb.enqueue("shopping_list_items", { error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeleteAllPurchasedItems(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(sb.queriesFor("shopping_list_items")[0]?.ops).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "eq", args: ["status", "purchased"] },
      { method: "await", args: [] },
    ]);
  });
});
