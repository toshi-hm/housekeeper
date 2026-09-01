import assert from "node:assert/strict";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { ShoppingPlannedRow } from "../../_shared/shoppingDuplicates.ts";
import type { PendingShoppingItem } from "../types.ts";
import { buildAddResultSpeech, upsertShoppingListItem } from "./yes-no.ts";

// #946: insertShoppingListItem (via upsertShoppingListItem) used to always
// perform a plain insert, bypassing the web app's duplicate-merge rule and
// tripping the DB partial unique indexes (shopping_planned_linked_item_unique
// / shopping_planned_name_unique) whenever the item was already on the list.
// These fakes stand in for the subset of SupabaseClient the merge/insert/
// retry logic uses, so that logic can be exercised without a live database.

interface FakeClientConfig {
  /** Rows returned by successive `.select(...).eq(...).eq(...)` calls (the last entry repeats once exhausted). */
  selectResults: ShoppingPlannedRow[][];
  insertError?: { code: string; message: string } | null;
}

const makeFakeClient = (
  config: FakeClientConfig,
): { client: SupabaseClient; insertedRows: Array<Record<string, unknown>> } => {
  let selectCallCount = 0;
  const insertedRows: Array<Record<string, unknown>> = [];
  const allKnownRows = config.selectResults.flat();

  const client = {
    from: (table: string) => {
      assert.strictEqual(table, "shopping_list_items");
      return {
        select: () => ({
          eq: () => ({
            eq: () => {
              const index = Math.min(selectCallCount, config.selectResults.length - 1);
              const data = config.selectResults[index] ?? [];
              selectCallCount += 1;
              return Promise.resolve({ data, error: null });
            },
          }),
        }),
        update: (values: { desired_units: number; linked_item_id: string | null }) => ({
          eq: (_col: string, id: string) => ({
            select: () => ({
              single: () => {
                const row = allKnownRows.find((r) => r.id === id);
                return Promise.resolve({
                  data: { ...(row ?? { id, name: "?", linked_item_id: null }), ...values },
                  error: null,
                });
              },
            }),
          }),
        }),
        insert: (values: Record<string, unknown>) => {
          insertedRows.push(values);
          return Promise.resolve({ error: config.insertError ?? null });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, insertedRows };
};

const makeItem = (overrides: Partial<PendingShoppingItem> = {}): PendingShoppingItem => ({
  id: null,
  name: "牛乳",
  units: 0,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  ...overrides,
});

Deno.test("upsertShoppingListItem (#946) - linked_item_id が一致する既存 planned 行があれば統合する", async () => {
  const existing: ShoppingPlannedRow = {
    id: "row-1",
    name: "牛乳",
    desired_units: 2,
    linked_item_id: "11111111-1111-1111-1111-111111111111",
  };
  const { client, insertedRows } = makeFakeClient({ selectResults: [[existing]] });

  const result = await upsertShoppingListItem(
    client,
    "user-1",
    makeItem({ id: "11111111-1111-1111-1111-111111111111", name: "別名の牛乳" }),
  );

  assert.deepStrictEqual(result, { ok: true, merged: true });
  assert.strictEqual(insertedRows.length, 0);
});

Deno.test("upsertShoppingListItem (#946) - 前後空白/大文字小文字を無視した名前一致でも統合する", async () => {
  const existing: ShoppingPlannedRow = {
    id: "row-2",
    name: " Milk ",
    desired_units: 1,
    linked_item_id: null,
  };
  const { client, insertedRows } = makeFakeClient({ selectResults: [[existing]] });

  const result = await upsertShoppingListItem(
    client,
    "user-1",
    makeItem({ id: null, name: "milk" }),
  );

  assert.deepStrictEqual(result, { ok: true, merged: true });
  assert.strictEqual(insertedRows.length, 0);
});

Deno.test("upsertShoppingListItem (#946) - 重複がなければ新規 insert する", async () => {
  const { client, insertedRows } = makeFakeClient({ selectResults: [[]] });

  const result = await upsertShoppingListItem(client, "user-1", makeItem({ name: "パン" }));

  assert.deepStrictEqual(result, { ok: true, merged: false });
  assert.strictEqual(insertedRows.length, 1);
  assert.strictEqual(insertedRows[0]?.name, "パン");
});

Deno.test("upsertShoppingListItem (#946) - 23505（ユニーク制約違反）を検知したら統合にリトライする", async () => {
  // クライアント側チェックの直後に別のリクエストが同じ行を作った競合を模して、
  // 1回目の select は空、insert は 23505、2回目（リトライ時）の select は
  // 競合により作られた行を返す。
  const conflicting: ShoppingPlannedRow = {
    id: "row-3",
    name: "牛乳",
    desired_units: 1,
    linked_item_id: null,
  };
  const { client, insertedRows } = makeFakeClient({
    selectResults: [[], [conflicting]],
    insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
  });

  const result = await upsertShoppingListItem(client, "user-1", makeItem({ name: "牛乳" }));

  assert.deepStrictEqual(result, { ok: true, merged: true });
  assert.strictEqual(
    insertedRows.length,
    1,
    "insert は1回だけ試行される（失敗後はリトライで統合する）",
  );
});

Deno.test("upsertShoppingListItem (#946) - 23505以外のinsertエラーで統合先も無ければ失敗を返す", async () => {
  const { client } = makeFakeClient({
    selectResults: [[]],
    insertError: { code: "23503", message: "foreign key violation" },
  });

  const result = await upsertShoppingListItem(client, "user-1", makeItem({ name: "パン" }));

  assert.deepStrictEqual(result, { ok: false, merged: false });
});

Deno.test("upsertShoppingListItem (#946) - 不正なUUID形式のidはlinked_item_idとして使わない", async () => {
  const { client, insertedRows } = makeFakeClient({ selectResults: [[]] });

  const result = await upsertShoppingListItem(
    client,
    "user-1",
    makeItem({ id: "not-a-uuid", name: "パン" }),
  );

  assert.deepStrictEqual(result, { ok: true, merged: false });
  assert.strictEqual(insertedRows[0]?.linked_item_id, null);
});

Deno.test("buildAddResultSpeech (#946) - 統合時は「追加しました」ではなく数量を増やした旨を伝える", () => {
  assert.strictEqual(
    buildAddResultSpeech("牛乳", { ok: true, merged: true }),
    "牛乳はすでに買い物リストにあったため、数量を増やしました。",
  );
});

Deno.test("buildAddResultSpeech (#946) - 新規追加時は従来通り「追加しました」と伝える", () => {
  assert.strictEqual(
    buildAddResultSpeech("パン", { ok: true, merged: false }),
    "パンを買い物リストに追加しました。",
  );
});

Deno.test("buildAddResultSpeech (#946) - 失敗時は失敗を伝える", () => {
  assert.strictEqual(
    buildAddResultSpeech("パン", { ok: false, merged: false }),
    "買い物リストへの追加に失敗しました。",
  );
});
