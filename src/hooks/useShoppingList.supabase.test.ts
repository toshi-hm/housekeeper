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
    insert: chainMethod("insert"),
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

// requireOnline() は navigator.onLine を見るため、テスト環境ではオンライン扱いにしておく。
// ConcurrentUpdateError も useItemLots.ts (createLot/syncItemAggregate) が同モジュールから
// importするため、ここでスタブしておかないと新規アイテム作成のハッピーパスに到達した際に
// モジュール解決エラーになる (#732 の回帰テストで到達するまで気づいていなかった)。
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  ConcurrentUpdateError: class ConcurrentUpdateError extends Error {},
  requireOnline: () => undefined,
}));

const { purchaseShoppingItem, upsertShoppingItem } = await import("@/hooks/useShoppingList");

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

  test("新規アイテム作成時、expiry_type/minimum_stock/auto_reorder/reorder_threshold/pin位置がitemsのupsertに含まれる (#732)", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: null }, error: null }, // shoppingRowForLink
      { data: { created_item_id: null }, error: null }, // shoppingRow
      { data: null, error: null }, // reserve created_item_id update
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: { id: "new-item-1" }, error: null }, // upsert新規アイテム
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: [], error: null }, // existingLots検索(空 → createLotを実行)
      { data: { id: "lot-1" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      itemValues: makeFormValues({
        expiry_type: "best_before",
        unit_price: 298,
        minimum_stock: 2,
        auto_reorder: true,
        reorder_threshold: 1,
        pin_x: 0.3,
        pin_y: 0.7,
      }),
    });

    const itemsUpsert = callLog.find((c) => c.table === "items" && c.method === "upsert");
    expect(itemsUpsert?.args[0]).toMatchObject({
      expiry_type: "best_before",
      minimum_stock: 2,
      auto_reorder: true,
      reorder_threshold: 1,
      pin_x: 0.3,
      pin_y: 0.7,
    });

    const lotInsert = callLog.find((c) => c.table === "item_lots" && c.method === "insert");
    expect(lotInsert?.args[0]).toMatchObject({ unit_price: 298 });
  });

  test("linked_item_id一致のアクティブな既存アイテムに統合した場合、_stackedを立てて呼び出し側の画像上書きを防ぐ (#894)", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-1", created_item_id: null }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // reserveAndCreateLotのcreated_item_id予約update(#912)
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: { id: "item-1", image_path: "existing.jpg" }, error: null }, // linkedActiveItem
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-1" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      itemValues: makeFormValues({ image_path: "new-photo.jpg" }),
    });

    expect(result._stacked).toBe(true);
    expect(result.image_path).toBe("existing.jpg");
    // linked_item_id一致経路では新規itemの作成(upsert)は発生しない
    expect(callLog.filter((c) => c.table === "items" && c.method === "upsert")).toHaveLength(0);
  });

  test("linked_item_idがソフトデリート済みアイテムを指す場合、復活させ_revivedを立てて呼び出し側の画像上書きを防ぐ (#894)", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-2", created_item_id: null }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // reserveAndCreateLotのcreated_item_id予約update(#912)
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: null, error: null }, // linkedActiveItem: 見つからない
      { data: { id: "item-2", image_path: "existing.jpg" }, error: null }, // linkedDeletedItem
      { data: { id: "item-2", image_path: "existing.jpg", deleted_at: null }, error: null }, // revive update
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-1" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      itemValues: makeFormValues({ image_path: "new-photo.jpg" }),
    });

    expect(result._revived).toBe(true);
    expect(result.image_path).toBe("existing.jpg");
  });

  // #830: linked_item_id一致でアクティブアイテムへ統合するパスは、購入ダイアログが
  // 事前に既存値でプリフィルされているため（`applyMergeFields: true`）、フォーム
  // 入力のカテゴリ/保管場所/メモ等を items テーブルへ反映してよい。
  test("linked_item_id一致 + applyMergeFields:trueの場合、フォーム入力が items の update に含まれる", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-1", created_item_id: null }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // reserveAndCreateLotのcreated_item_id予約update(#912)
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: { id: "item-1", name: "牛乳" }, error: null }, // linkedActiveItem検索
      {
        data: { id: "item-1", name: "牛乳", category_id: "cat-1", notes: "スーパーで購入" },
        error: null,
      }, // マージ用update
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-1" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      applyMergeFields: true,
      itemValues: makeFormValues({
        category_id: "cat-1",
        notes: "スーパーで購入",
        minimum_stock: 3,
        auto_reorder: true,
        reorder_threshold: 1,
        expiry_type: "use_by",
      }),
    });

    const mergeUpdate = callLog.find(
      (c) =>
        c.table === "items" &&
        c.method === "update" &&
        (c.args[0] as Record<string, unknown>).category_id === "cat-1",
    );
    expect(mergeUpdate?.args[0]).toMatchObject({
      category_id: "cat-1",
      notes: "スーパーで購入",
      minimum_stock: 3,
      auto_reorder: true,
      reorder_threshold: 1,
      expiry_type: "use_by",
    });
    // 購入数量(units)や content_amount 等ロット固有の値は items 側の update に含めない
    expect(mergeUpdate?.args[0]).not.toHaveProperty("units");
    expect(mergeUpdate?.args[0]).not.toHaveProperty("content_amount");
    // マージパスでも呼び出し側の画像上書き防止フラグは立つ (#894)
    expect(result).toMatchObject({ id: "item-1", category_id: "cat-1", _stacked: true });
  });

  // #879セルフレビュー: applyMergeFieldsを立てずに呼ぶと(=購入ダイアログが
  // プリフィルされていない場合の実際の呼び出され方)、items側は一切updateされず
  // 既存のカテゴリ/保管場所/メモ等が保持される（フォームの空欄で上書きされない）。
  test("linked_item_id一致でもapplyMergeFields未指定なら items をupdateしない(既存値を保持)", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-1", created_item_id: null }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // reserveAndCreateLotのcreated_item_id予約update(#912)
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      {
        data: {
          id: "item-1",
          name: "牛乳",
          category_id: "existing-cat",
          storage_location_id: "existing-loc",
        },
        error: null,
      }, // linkedActiveItem検索
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-1" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      // ダイアログがプリフィルされていない実際のケースを模して、フォームは
      // 空欄のまま（category_id/storage_location_id指定なし）で呼ぶ。
      itemValues: makeFormValues({}),
    });

    // items へのupdateはsyncItemAggregate分(units/expiry_date等の集計)のみで、
    // category_id/storage_location_id等のマージフィールドを含むupdateは無いはず。
    const mergeUpdate = callLog.find(
      (c) =>
        c.table === "items" &&
        c.method === "update" &&
        "category_id" in (c.args[0] as Record<string, unknown>),
    );
    expect(mergeUpdate).toBeUndefined();
    // 既存値がそのまま(空欄で上書きされず)返る
    expect(result).toMatchObject({ id: "item-1", category_id: "existing-cat" });
  });

  // #879セルフレビュー: バーコード一致は購入完了時にしか対象が判明せずダイアログを
  // プリフィルできないため、フォーム入力を items へ反映すると空欄で既存値を消して
  // しまう(#879で発見されたデータ損失バグ)。items は一切updateしないことを検証する。
  test("バーコード一致でアクティブな既存アイテムへ統合する際、items をupdateせず既存値を保持する", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: null, created_item_id: null }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // reserveAndCreateLotのcreated_item_id予約update(#912)
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      {
        data: { id: "item-2", name: "洗剤", storage_location_id: "existing-loc" },
        error: null,
      }, // activeItem検索(barcode一致)
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-2" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      // ダイアログはプリフィルされない(barcode一致は購入完了時にしか判明しない)
      // ため、フォームは空欄のまま(storage_location_id指定なし)で呼ぶ。
      itemValues: makeFormValues({ barcode: "123456" }),
    });

    const mergeUpdate = callLog.find(
      (c) =>
        c.table === "items" &&
        c.method === "update" &&
        "storage_location_id" in (c.args[0] as Record<string, unknown>),
    );
    expect(mergeUpdate).toBeUndefined();
    expect(result).toMatchObject({
      id: "item-2",
      storage_location_id: "existing-loc",
      _stacked: true,
    });
  });
});

describe("purchaseShoppingItem (#912: 既存アイテム統合パスの冪等化)", () => {
  // markShoppingItemPurchased がネットワーク瞬断等で失敗すると shopping 行は
  // planned のまま残り、同じ購入操作がリトライされ得る。createLot 成功後に
  // 予約された created_item_id が既に対象アイテムを指していれば、リトライ時に
  // createLot(ロット作成)をスキップし、在庫ロットの二重作成を防ぐ。
  test("linked_item_id一致でcreated_item_idが既に対象アイテムへ予約済みなら、createLotをスキップする(リトライ時の二重作成防止)", async () => {
    responseQueues.shopping_list_items = [
      // 直前の試行で createLot/syncItemAggregate まで成功済み
      // (created_item_id が既に linkedActiveItem を指している)
      { data: { linked_item_id: "item-1", created_item_id: "item-1" }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: { id: "item-1", image_path: "existing.jpg" }, error: null }, // linkedActiveItem
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      itemValues: makeFormValues({ image_path: "new-photo.jpg" }),
    });

    expect(result._stacked).toBe(true);
    // 予約済みなので item_lots への insert(createLot)は発生しない
    // (syncItemAggregateによるselectは冪等化ガードに関係なく常に走るため対象外)
    expect(callLog.filter((c) => c.table === "item_lots" && c.method === "insert")).toHaveLength(0);
    expect(
      callLog.filter((c) => c.table === "shopping_list_items" && c.method === "update"),
    ).toHaveLength(1);
  });

  test("バーコード一致でcreated_item_idが既に対象アイテムへ予約済みなら、createLotをスキップする(リトライ時の二重作成防止)", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: null, created_item_id: "item-2" }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: { id: "item-2", barcode: "123456" }, error: null }, // activeItem検索(barcode一致)
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];

    const result = await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      itemValues: makeFormValues({ barcode: "123456" }),
    });

    expect(result._stacked).toBe(true);
    expect(callLog.filter((c) => c.table === "item_lots" && c.method === "insert")).toHaveLength(0);
  });

  test("created_item_idが別アイテムを指す場合(初回購入)は、予約updateしてからcreateLotする", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-3", created_item_id: null }, error: null }, // shoppingRowForLink
      { data: null, error: null }, // reserveAndCreateLotのcreated_item_id予約update
      { data: null, error: null }, // markShoppingItemPurchased
    ];
    responseQueues.items = [
      { data: { id: "item-3", image_path: "existing.jpg" }, error: null }, // linkedActiveItem
      { data: { content_amount: 1 }, error: null }, // syncItemAggregate content_amount
      { data: null, error: null }, // syncItemAggregate update
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-3" }, error: null }, // createLot insert
      { data: [], error: null }, // syncItemAggregateのロット取得
    ];

    await purchaseShoppingItem({
      shoppingItemId: "shopping-1",
      itemValues: makeFormValues({}),
    });

    const reserveUpdate = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "update",
    );
    expect(reserveUpdate?.args[0]).toMatchObject({ created_item_id: "item-3" });
    expect(callLog.filter((c) => c.table === "item_lots" && c.method === "insert")).toHaveLength(1);
  });

  // createLot が失敗した場合に created_item_id の予約だけが残ってしまうと、
  // リトライ時に「予約済み＝ロット作成済み」と誤判定して createLot が永久に
  // スキップされ、対象アイテムにロットが1件も作られなくなる(サイレントな
  // 在庫欠落)。createLot を予約updateより先に実行することで、createLotが
  // 失敗した場合は予約updateが呼ばれず、リトライ時に再度createLotが
  // 試みられることを検証する。
  test("createLotが失敗した場合、created_item_idの予約updateは呼ばれない(リトライ時のロット欠落防止)", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-4", created_item_id: null }, error: null }, // shoppingRowForLink
    ];
    responseQueues.items = [
      { data: { id: "item-4", image_path: "existing.jpg" }, error: null }, // linkedActiveItem
    ];
    responseQueues.item_lots = [
      { data: null, error: new Error("network error") }, // createLot insert
    ];

    await expect(
      purchaseShoppingItem({
        shoppingItemId: "shopping-1",
        itemValues: makeFormValues({}),
      }),
    ).rejects.toThrow("network error");

    expect(
      callLog.filter((c) => c.table === "shopping_list_items" && c.method === "update"),
    ).toHaveLength(0);
  });
});

describe("upsertShoppingItem (#766: 同名の同時追加による重複行の防止)", () => {
  test("client側の重複チェック後にDB側でユニーク制約違反(23505)が起きた場合、既存行への統合にリトライする", async () => {
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // 1回目のplannedRows検索: この時点では重複なし(競合相手がまだcommitしていない)
      {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      }, // 最終upsert: 競合相手が先にinsertし、DB制約違反
      {
        data: [
          {
            id: "row-existing",
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
          },
        ],
        error: null,
      }, // リトライ後のplannedRows検索: 競合相手の行が見えるようになっている
      { data: { id: "row-existing", desired_units: 2 }, error: null }, // 統合のupdate
    ];

    const result = await upsertShoppingItem({ name: "牛乳", desired_units: 1 });

    expect(result).toMatchObject({ id: "row-existing", desired_units: 2 });
    const updateCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "update",
    );
    expect(updateCall?.args[0]).toMatchObject({ desired_units: 2 });
  });

  test("23505以外のエラーはリトライせずそのままthrowする", async () => {
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // plannedRows検索: 重複なし
      { data: null, error: { code: "42501", message: "permission denied" } }, // 最終upsert: 無関係なエラー
    ];

    await expect(upsertShoppingItem({ name: "牛乳" })).rejects.toBeTruthy();

    // リトライ(2回目のplannedRows検索)は行われていないはず(plannedRows検索は
    // status="planned" の eq() を伴うのが目印。upsert 自体の select() と区別する)
    const plannedSearches = callLog.filter(
      (c) =>
        c.table === "shopping_list_items" &&
        c.method === "eq" &&
        c.args[0] === "status" &&
        c.args[1] === "planned",
    );
    expect(plannedSearches).toHaveLength(1);
  });
});

describe("upsertShoppingItem (#952: 重複統合の並行更新でのロストアップデート防止)", () => {
  const duplicateRow = (units: number) => ({
    id: "row-existing",
    user_id: "user-1",
    name: "牛乳",
    desired_units: units,
    note: null,
    linked_item_id: null,
    status: "planned",
    purchased_at: null,
    created_item_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  test("並行マージで desired_units が読み取り時から変わっていた場合、最新値を再取得して増分を計算し直しリトライする", async () => {
    responseQueues.shopping_list_items = [
      { data: [duplicateRow(1)], error: null }, // plannedRows検索: desired_units=1の重複行を発見
      { data: null, error: null }, // 1回目のupdate: desired_units=1条件が0件ヒット(並行マージで既に変わっていた)
      { data: duplicateRow(3), error: null }, // 再取得: 別の並行マージで既にdesired_units=3になっている
      { data: { ...duplicateRow(4) }, error: null }, // 2回目のupdate(desired_units=3基準): 成功
    ];

    const result = await upsertShoppingItem({ name: "牛乳", desired_units: 1 });

    expect(result).toMatchObject({ id: "row-existing", desired_units: 4 });
    const updateCalls = callLog.filter(
      (c) => c.table === "shopping_list_items" && c.method === "update",
    );
    expect(updateCalls).toHaveLength(2);
    // 1回目は古い値(1)を基準に、2回目は再取得した最新値(3)を基準に増分している
    expect(updateCalls[0]?.args[0]).toMatchObject({ desired_units: 2 });
    expect(updateCalls[1]?.args[0]).toMatchObject({ desired_units: 4 });
    // どちらのupdateも直前に読んだdesired_unitsを楽観ロック条件にしている
    const eqCalls = callLog.filter(
      (c) =>
        c.table === "shopping_list_items" && c.method === "eq" && c.args[0] === "desired_units",
    );
    expect(eqCalls.map((c) => c.args[1])).toEqual([1, 3]);
  });

  test("再試行の上限を超えて競合が続く場合はエラーになる", async () => {
    responseQueues.shopping_list_items = [
      { data: [duplicateRow(1)], error: null }, // plannedRows検索
      { data: null, error: null }, // 1回目update: 失敗
      { data: duplicateRow(2), error: null }, // 再取得1
      { data: null, error: null }, // 2回目update: 失敗
      { data: duplicateRow(3), error: null }, // 再取得2
      { data: null, error: null }, // 3回目update: 失敗(上限到達)
      { data: duplicateRow(4), error: null }, // 再取得3
    ];

    await expect(upsertShoppingItem({ name: "牛乳", desired_units: 1 })).rejects.toThrow(
      "too many concurrent updates",
    );
  });
});

describe("upsertShoppingItem (#619: インライン編集での linked_item_id 消失の防止)", () => {
  test("編集時に linked_item_id を渡さない場合、既存行の値を取得して保持する", async () => {
    responseQueues.shopping_list_items = [
      { data: { linked_item_id: "item-9" }, error: null }, // 既存値の取得(maybeSingle)
      { data: { id: "row-1", linked_item_id: "item-9" }, error: null }, // upsert結果
    ];

    await upsertShoppingItem({ id: "row-1", name: "牛乳", desired_units: 2, note: null });

    const upsertCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "upsert",
    );
    expect(upsertCall?.args[0]).toMatchObject({ linked_item_id: "item-9" });
  });

  test("編集時に linked_item_id が明示的に渡された場合はその値で上書きする", async () => {
    responseQueues.shopping_list_items = [
      { data: { id: "row-1", linked_item_id: "item-2" }, error: null }, // upsert結果
    ];

    await upsertShoppingItem({ id: "row-1", name: "牛乳", linked_item_id: "item-2" });

    // 既存値の取得(maybeSingle)は呼ばれない
    expect(
      callLog.filter((c) => c.table === "shopping_list_items" && c.method === "maybeSingle"),
    ).toHaveLength(0);
    const upsertCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "upsert",
    );
    expect(upsertCall?.args[0]).toMatchObject({ linked_item_id: "item-2" });
  });

  test("編集時に linked_item_id が明示的に null の場合はクリアする", async () => {
    responseQueues.shopping_list_items = [
      { data: { id: "row-1", linked_item_id: null }, error: null },
    ];

    await upsertShoppingItem({ id: "row-1", name: "牛乳", linked_item_id: null });

    const upsertCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "upsert",
    );
    expect(upsertCall?.args[0]).toMatchObject({ linked_item_id: null });
  });

  test("新規追加時（idなし）は既存値取得を行わず渡された linked_item_id をそのまま使う", async () => {
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // 重複チェック(plannedRows)
      { data: { id: "row-new", linked_item_id: "item-5" }, error: null }, // upsert結果
    ];

    await upsertShoppingItem({ name: "牛乳", linked_item_id: "item-5" });

    const upsertCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "upsert",
    );
    expect(upsertCall?.args[0]).toMatchObject({ linked_item_id: "item-5" });
  });
});
