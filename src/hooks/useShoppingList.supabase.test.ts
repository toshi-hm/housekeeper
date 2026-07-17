import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ItemFormValues } from "@/types/item";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: null, error: null };

const makeBuilder = (table: string, response: SupabaseResponse) => {
  const builder: Record<string, unknown> = {};
  const chainMethod =
    (method: string) =>
    (...args: unknown[]) => {
      callLog.push({ table, method, args });
      return builder;
    };

  Object.assign(builder, {
    select: chainMethod("select"),
    eq: chainMethod("eq"),
    is: chainMethod("is"),
    not: chainMethod("not"),
    limit: chainMethod("limit"),
    update: chainMethod("update"),
    upsert: chainMethod("upsert"),
    single: () => {
      callLog.push({ table, method: "single", args: [] });
      return Promise.resolve(response);
    },
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (v: SupabaseResponse) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(response).then(resolve, reject),
  });
  return builder;
};

const fromMock = mock((table: string) => {
  const queue = responseQueues[table];
  const response = queue && queue.length > 0 ? queue.shift()! : defaultResponse;
  return makeBuilder(table, response);
});

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } } }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

// requireOnline() は navigator.onLine を見るため、テスト環境ではオンライン扱いにしておく
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { purchaseShoppingItem } = await import("@/hooks/useShoppingList");

const makeFormValues = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  name: "テスト商品",
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
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("purchaseShoppingItem (#440: 未検査エラーによる重複作成の防止)", () => {
  test("バーコード一致アイテム検索(activeItem)がerrorを返すとthrowし、後続処理(ロット作成等)を実行しない", async () => {
    responseQueues.items = [{ data: null, error: { message: "network error" } }];

    await expect(
      purchaseShoppingItem({
        shoppingItemId: "shopping-1",
        itemValues: makeFormValues({ barcode: "123456" }),
      }),
    ).rejects.toBeTruthy();

    // items テーブルへの1回目の問い合わせ(activeItem検索)以降、ロット作成などは呼ばれない
    expect(callLog.filter((c) => c.table === "item_lots")).toHaveLength(0);
  });

  test("ソフトデリート済みアイテム検索(deletedItem)がerrorを返すとthrowする", async () => {
    responseQueues.items = [
      { data: null, error: null }, // activeItem: 見つからない
      { data: null, error: { message: "boom" } }, // deletedItem: エラー
    ];

    await expect(
      purchaseShoppingItem({
        shoppingItemId: "shopping-1",
        itemValues: makeFormValues({ barcode: "123456" }),
      }),
    ).rejects.toBeTruthy();
  });

  test("created_item_id 予約用の shoppingRow 検索がerrorを返すとthrowし、新規アイテムを作成しない", async () => {
    responseQueues.shopping_list_items = [{ data: null, error: { message: "boom" } }];

    await expect(
      purchaseShoppingItem({
        shoppingItemId: "shopping-1",
        itemValues: makeFormValues({ barcode: "" }),
      }),
    ).rejects.toBeTruthy();

    // items へのupsert(新規作成)は呼ばれていないはず
    expect(callLog.filter((c) => c.table === "items" && c.method === "upsert")).toHaveLength(0);
  });

  test("既存ロット検索(existingLots)がerrorを返すとthrowし、ロットを二重作成しない", async () => {
    responseQueues.shopping_list_items = [
      { data: { created_item_id: null }, error: null }, // shoppingRow
      { data: null, error: null }, // reserve created_item_id update
    ];
    responseQueues.items = [
      { data: { id: "new-item-1" }, error: null }, // upsert新規アイテム
    ];
    responseQueues.item_lots = [{ data: null, error: { message: "boom" } }]; // existingLots検索

    await expect(
      purchaseShoppingItem({
        shoppingItemId: "shopping-1",
        itemValues: makeFormValues({ barcode: "" }),
      }),
    ).rejects.toBeTruthy();

    // existingLots検索がエラーで止まるため、createLot(insert)は呼ばれていないはず
    const lotInserts = callLog.filter(
      (c) => c.table === "item_lots" && (c.method === "select" || c.method === "single"),
    );
    // select は existingLots検索の1回のみ (createLotのinsert→singleは呼ばれない)
    expect(lotInserts.filter((c) => c.method === "single")).toHaveLength(0);
  });
});
