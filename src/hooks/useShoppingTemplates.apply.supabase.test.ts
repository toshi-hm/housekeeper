import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ShoppingTemplateWithItems } from "@/types/shopping";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: [], error: null };

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
// importするため、ここでスタブしておかないとモジュール解決エラーになる。
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  ConcurrentUpdateError: class ConcurrentUpdateError extends Error {},
  requireOnline: () => undefined,
}));

const { applyShoppingTemplate } = await import("@/hooks/useShoppingTemplates");

const makeTemplate = (items: ShoppingTemplateWithItems["items"]): ShoppingTemplateWithItems => ({
  id: "template-1",
  user_id: "user-1",
  name: "定番セット",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items,
});

const templateItem = (
  name: string,
  desired_units = 1,
): ShoppingTemplateWithItems["items"][number] => ({
  id: `template-item-${name}`,
  template_id: "template-1",
  user_id: "user-1",
  name,
  desired_units,
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("applyShoppingTemplate (#852: テンプレート一括適用時の23505リトライ欠如の修正)", () => {
  test("競合が無ければ全アイテムをそのまま追加する", async () => {
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // 既存planned名の取得（重複なし）
      { data: [], error: null }, // 牛乳: mergeIntoDuplicatePlannedItem 事前チェック（重複なし）
      { data: { id: "row-milk" }, error: null }, // 牛乳: upsert成功
      { data: [], error: null }, // 卵: mergeIntoDuplicatePlannedItem 事前チェック（重複なし）
      { data: { id: "row-egg" }, error: null }, // 卵: upsert成功
    ];

    const result = await applyShoppingTemplate(
      makeTemplate([templateItem("牛乳"), templateItem("卵", 2)]),
    );

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(
      callLog.filter((c) => c.table === "shopping_list_items" && c.method === "upsert"),
    ).toHaveLength(2);
  });

  test("1件が一意制約違反(23505)で競合しても、その行だけ既存行へ統合し、他の行を巻き込んで失敗させない", async () => {
    responseQueues.shopping_list_items = [
      { data: [], error: null }, // 既存planned名の取得（重複なし）
      { data: [], error: null }, // 牛乳: mergeIntoDuplicatePlannedItem 事前チェック（重複なし）
      { data: { id: "row-milk" }, error: null }, // 牛乳: upsert成功
      { data: [], error: null }, // 卵: mergeIntoDuplicatePlannedItem 事前チェック（重複なし）
      {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      }, // 卵: upsertが競合相手のinsertとぶつかり失敗
      {
        data: [
          {
            id: "row-egg-existing",
            user_id: "user-1",
            name: "卵",
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
      }, // 卵: リトライのmergeIntoDuplicatePlannedItemで競合相手の行が見えるようになっている
      { data: { id: "row-egg-existing", desired_units: 3 }, error: null }, // 卵: 既存行への統合update
    ];

    const result = await applyShoppingTemplate(
      makeTemplate([templateItem("牛乳"), templateItem("卵", 2)]),
    );

    // 牛乳・卵とも「追加」として扱われる（卵は統合だが、テンプレート側から見れば新規追加分として処理済み）
    expect(result).toEqual({ added: 2, skipped: 0 });

    const eggUpdate = callLog.find(
      (c) => c.table === "shopping_list_items" && c.method === "update",
    );
    expect(eggUpdate?.args[0]).toMatchObject({ desired_units: 3 });
  });

  test("client側フィルタで既存planned名と重複するアイテムはDBへ問い合わせずスキップする", async () => {
    responseQueues.shopping_list_items = [
      { data: [{ name: "牛乳" }], error: null }, // 既存planned名の取得（牛乳が既存）
    ];

    const result = await applyShoppingTemplate(makeTemplate([templateItem("牛乳")]));

    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(
      callLog.filter((c) => c.table === "shopping_list_items" && c.method === "upsert"),
    ).toHaveLength(0);
  });
});
