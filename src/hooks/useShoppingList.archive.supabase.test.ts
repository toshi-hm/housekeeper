import { beforeEach, describe, expect, mock, test } from "bun:test";

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
    order: chainMethod("order"),
    insert: (...args: unknown[]) => {
      callLog.push({ table, method: "insert", args });
      return Promise.resolve(response);
    },
    delete: chainMethod("delete"),
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

mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { archivePurchasedItems } = await import("@/hooks/useShoppingList");

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("archivePurchasedItems (#365: 購入済みクリア時のアーカイブ)", () => {
  test("purchased 行がある場合、shopping_list_archive へ insert してから shopping_list_items を delete する", async () => {
    responseQueues.shopping_list_items = [
      {
        data: [
          { id: "row-1", name: "牛乳", desired_units: 2, note: "低脂肪" },
          { id: "row-2", name: "卵", desired_units: 1, note: null },
        ],
        error: null,
      }, // fetch purchased rows
      { data: null, error: null }, // delete
    ];
    responseQueues.shopping_list_archive = [{ data: null, error: null }]; // insert

    await archivePurchasedItems();

    const tablesCalledInOrder = callLog
      .filter(
        (c) =>
          (c.table === "shopping_list_items" && (c.method === "select" || c.method === "delete")) ||
          (c.table === "shopping_list_archive" && c.method === "insert"),
      )
      .map((c) => `${c.table}.${c.method}`);

    expect(tablesCalledInOrder).toEqual([
      "shopping_list_items.select",
      "shopping_list_archive.insert",
      "shopping_list_items.delete",
    ]);

    const insertCall = callLog.find(
      (c) => c.table === "shopping_list_archive" && c.method === "insert",
    );
    const insertedRows = insertCall?.args[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      user_id: "user-1",
      name: "牛乳",
      desired_units: 2,
      note: "低脂肪",
    });
    expect(insertedRows[1]).toMatchObject({
      user_id: "user-1",
      name: "卵",
      desired_units: 1,
      note: null,
    });
    // 同一クリア操作の全行が同じ archived_at を共有する（日付別グループ化の下地）
    expect(insertedRows[0]?.archived_at).toBe(insertedRows[1]?.archived_at as string);
  });

  test("purchased 行が0件のときは insert をスキップして delete のみ実行する", async () => {
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // fetch: no purchased rows
      { data: null, error: null }, // delete
    ];

    await archivePurchasedItems();

    expect(callLog.some((c) => c.table === "shopping_list_archive")).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "delete")).toBe(
      true,
    );
  });

  test("fetch がエラーを返すと throw し、insert も delete も実行しない", async () => {
    responseQueues.shopping_list_items = [{ data: null, error: { message: "boom" } }];

    await expect(archivePurchasedItems()).rejects.toBeTruthy();

    expect(callLog.some((c) => c.table === "shopping_list_archive")).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "delete")).toBe(
      false,
    );
  });

  test("insert がエラーを返すと throw し、delete を実行しない（履歴を残さず削除しない）", async () => {
    responseQueues.shopping_list_items = [
      { data: [{ id: "row-1", name: "牛乳", desired_units: 1, note: null }], error: null },
    ];
    responseQueues.shopping_list_archive = [{ data: null, error: { message: "boom" } }];

    await expect(archivePurchasedItems()).rejects.toBeTruthy();

    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "delete")).toBe(
      false,
    );
  });

  test("delete がエラーを返すと throw する", async () => {
    responseQueues.shopping_list_items = [
      { data: [{ id: "row-1", name: "牛乳", desired_units: 1, note: null }], error: null },
      { data: null, error: { message: "boom" } },
    ];
    responseQueues.shopping_list_archive = [{ data: null, error: null }];

    await expect(archivePurchasedItems()).rejects.toBeTruthy();
  });
});
