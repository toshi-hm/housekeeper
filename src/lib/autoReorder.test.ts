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
    limit: chainMethod("limit"),
    insert: chainMethod("insert"),
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

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}));

const { maybeAutoReorder } = await import("@/lib/autoReorder");

const baseItem = {
  id: "item-1",
  user_id: "user-1",
  name: "牛乳",
  units: 0,
  auto_reorder: true,
  reorder_threshold: null as number | null,
};

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("maybeAutoReorder", () => {
  test("auto_reorder が false のときは何もしない", async () => {
    responseQueues.items = [{ data: { ...baseItem, auto_reorder: false }, error: null }];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items")).toBe(false);
  });

  test("units が threshold より大きいときは追加しない", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 5, reorder_threshold: 2 }, error: null }];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items")).toBe(false);
  });

  test("reorder_threshold が null のときは units<=0 で追加する", async () => {
    responseQueues.items = [
      { data: { ...baseItem, units: 0, reorder_threshold: null }, error: null },
    ];
    responseQueues.shopping_list_items = [
      { data: null, error: null }, // insert
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
    const insertCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "insert",
    );
    expect(insertCall?.args[0]).toMatchObject({
      user_id: "user-1",
      name: "牛乳",
      desired_units: 1,
      linked_item_id: "item-1",
      auto_added: true,
    });
  });

  test("units が threshold ちょうどのときも追加する", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 2, reorder_threshold: 2 }, error: null }];
    responseQueues.shopping_list_items = [{ data: null, error: null }];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
  });

  test("同じ linked_item_id の planned 行との一意制約競合は追加済みとして扱う", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 0 }, error: null }];
    responseQueues.shopping_list_items = [
      { data: null, error: { code: "23505", message: "duplicate" } },
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "insert")).toBe(
      true,
    );
  });

  test("アイテムが見つからない場合は何もしない", async () => {
    responseQueues.items = [{ data: null, error: null }];

    const result = await maybeAutoReorder("missing-item");

    expect(result).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items")).toBe(false);
  });

  test("エラーが発生しても例外を投げず false を返す（非致命）", async () => {
    responseQueues.items = [{ data: null, error: { message: "boom" } }];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
  });

  test("insert 失敗時も例外を投げず false を返す", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 0 }, error: null }];
    responseQueues.shopping_list_items = [
      { data: null, error: { message: "insert failed" } }, // insert fails
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
  });
});
