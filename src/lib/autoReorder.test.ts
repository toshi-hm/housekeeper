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
    limit: chainMethod("limit"),
    insert: chainMethod("insert"),
    update: chainMethod("update"),
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    single: () => {
      callLog.push({ table, method: "single", args: [] });
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

  test("reorder_threshold が null のときは units<=0 で追加する（重複なし）", async () => {
    responseQueues.items = [
      { data: { ...baseItem, units: 0, reorder_threshold: null }, error: null },
    ];
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // duplicate lookup: no planned rows
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
    responseQueues.shopping_list_items = [
      { data: [], error: null },
      { data: null, error: null },
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
  });

  // #829: 自由入力済みの同名 planned 行がある状態で自動追加が発火すると、
  // 直接 insert していたため別行として二重に表示されていた。手動追加
  // （upsertShoppingItem）と同じ findDuplicatePlannedItem 基準で統合する。
  test("同名の手動追加 planned 行が既にある場合は insert せず desired_units を統合する (#829)", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 0 }, error: null }];
    responseQueues.shopping_list_items = [
      {
        data: [
          {
            id: "shopping-1",
            user_id: "user-1",
            name: "牛乳",
            desired_units: 1,
            note: null,
            linked_item_id: null,
            auto_added: false,
            status: "planned",
            purchased_at: null,
            created_item_id: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
      { data: { id: "shopping-1", desired_units: 2 }, error: null }, // update
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "insert")).toBe(
      false,
    );
    const updateCall = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "update",
    );
    expect(updateCall?.args[0]).toMatchObject({
      desired_units: 2,
      linked_item_id: "item-1",
      auto_added: true,
    });
  });

  test("同一 linked_item_id の planned 行が既にある場合も統合する", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 0 }, error: null }];
    responseQueues.shopping_list_items = [
      {
        data: [
          {
            id: "shopping-1",
            user_id: "user-1",
            name: "牛乳(1L)",
            desired_units: 3,
            note: null,
            linked_item_id: "item-1",
            auto_added: true,
            status: "planned",
            purchased_at: null,
            created_item_id: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
      { data: { id: "shopping-1", desired_units: 4 }, error: null },
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "insert")).toBe(
      false,
    );
  });

  test("select と insert の間の競合(23505)時は統合をリトライする", async () => {
    responseQueues.items = [{ data: { ...baseItem, units: 0 }, error: null }];
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // first duplicate lookup: nothing yet
      { data: null, error: { code: "23505", message: "duplicate" } }, // insert races and loses
      {
        data: [
          {
            id: "shopping-1",
            user_id: "user-1",
            name: "牛乳",
            desired_units: 1,
            note: null,
            linked_item_id: "item-1",
            auto_added: true,
            status: "planned",
            purchased_at: null,
            created_item_id: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      }, // retry lookup: the concurrent insert is now visible
      { data: { id: "shopping-1", desired_units: 2 }, error: null }, // retry merge succeeds
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
    const calls = callLog.filter((c) => c.table === "shopping_list_items");
    expect(calls.filter((c) => c.method === "insert")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "update")).toHaveLength(1);
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
      { data: [], error: null }, // duplicate lookup: none
      { data: null, error: { message: "insert failed" } }, // insert fails
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
  });
});

// 消費ペース予測に基づく自動追加 (#853)。個数はしきい値を超えている
// （threshold=null→0、units=10 なので thresholdDue=false）状態でのみ、
// reorder_lead_days の判定が意味を持つ。
describe("maybeAutoReorder — 消費ペース予測ベースの自動追加 (#853)", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const paceItem = {
    ...baseItem,
    units: 10,
    reorder_threshold: null,
    content_amount: 1,
    content_unit: "個",
    opened_remaining: null,
  };

  test("reorder_lead_days が未設定なら、消費ペースが速くても追加しない", async () => {
    responseQueues.items = [{ data: { ...paceItem, reorder_lead_days: null }, error: null }];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
    expect(callLog.some((c) => c.table === "consumption_logs")).toBe(false);
  });

  test("予測残日数が reorder_lead_days 以下なら、個数がしきい値を超えていても追加する", async () => {
    responseQueues.items = [{ data: { ...paceItem, reorder_lead_days: 5 }, error: null }];
    responseQueues.consumption_logs = [
      {
        data: [
          { delta_amount: 30, delta_unit: "個", occurred_at: daysAgo(3) },
          { delta_amount: 30, delta_unit: "個", occurred_at: daysAgo(10) },
        ],
        error: null,
      },
    ];
    responseQueues.shopping_list_items = [
      { data: [], error: null },
      { data: null, error: null },
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(true);
    expect(callLog.some((c) => c.table === "consumption_logs")).toBe(true);
    expect(callLog.some((c) => c.table === "shopping_list_items" && c.method === "insert")).toBe(
      true,
    );
  });

  test("予測残日数が reorder_lead_days を超える場合は追加しない", async () => {
    responseQueues.items = [{ data: { ...paceItem, reorder_lead_days: 5 }, error: null }];
    responseQueues.consumption_logs = [
      {
        data: [
          { delta_amount: 15, delta_unit: "個", occurred_at: daysAgo(3) },
          { delta_amount: 15, delta_unit: "個", occurred_at: daysAgo(10) },
        ],
        error: null,
      },
    ];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
    expect(callLog.some((c) => c.table === "shopping_list_items")).toBe(false);
  });

  test("consumption_logs の取得に失敗しても例外を投げず false を返す（非致命）", async () => {
    responseQueues.items = [{ data: { ...paceItem, reorder_lead_days: 5 }, error: null }];
    responseQueues.consumption_logs = [{ data: null, error: { message: "boom" } }];

    const result = await maybeAutoReorder("item-1");

    expect(result).toBe(false);
  });
});
