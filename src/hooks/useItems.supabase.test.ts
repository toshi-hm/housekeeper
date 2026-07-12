import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Item } from "@/types/item";

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
    or: chainMethod("or"),
    limit: chainMethod("limit"),
    order: chainMethod("order"),
    insert: chainMethod("insert"),
    update: chainMethod("update"),
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

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}));

const { fetchItem, tryStackToActiveItem, buildNameOrBarcodeSearchFilter, escapeOrFilterValue } =
  await import("@/hooks/useItems");

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "Test Item",
  barcode: "123456",
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  notes: null,
  image_path: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("fetchItem", () => {
  test("deleted_at IS NULL でフィルタする (#439: ソフトデリート済みアイテムへの直アクセス防止)", async () => {
    responseQueues.items = [{ data: makeItem(), error: null }];
    await fetchItem("item-1");

    const isCall = callLog.find((c) => c.table === "items" && c.method === "is");
    expect(isCall?.args).toEqual(["deleted_at", null]);
  });

  test("該当行がない(ソフトデリート済み等)場合はエラーをthrowする", async () => {
    responseQueues.items = [{ data: null, error: { message: "no rows", code: "PGRST116" } }];
    await expect(fetchItem("item-1")).rejects.toBeTruthy();
  });
});

describe("tryStackToActiveItem", () => {
  test("最終再取得でerrorが返るとthrowする (#442: onSuccess内での未処理例外を防止)", async () => {
    responseQueues.items = [
      { data: makeItem(), error: null }, // 1st call: find matching active item
      { data: null, error: { message: "boom" } }, // 2nd call: refetch after createLot
    ];
    responseQueues.item_lots = [
      { data: { id: "lot-1" }, error: null }, // createLot insert
      { data: [{ units: 1, expiry_date: null, opened_remaining: null }], error: null }, // syncItemAggregate select
    ];

    await expect(
      tryStackToActiveItem("123456", { name: "Test", units: 1 }, "user-1"),
    ).rejects.toBeTruthy();
  });

  test("マッチするアイテムがなければnullを返す", async () => {
    responseQueues.items = [{ data: null, error: null }];
    const result = await tryStackToActiveItem("000000", { name: "Test", units: 1 }, "user-1");
    expect(result).toBeNull();
  });
});

describe("buildNameOrBarcodeSearchFilter", () => {
  test("通常の検索語はname/barcode両方のilikeパターンを生成する", () => {
    expect(buildNameOrBarcodeSearchFilter("milk")).toBe(
      'name.ilike."%milk%",barcode.ilike."%milk%"',
    );
  });

  test("PostgRESTのor()予約文字(カンマ・括弧・ピリオド)を含む検索語でも壊れない (#434)", () => {
    const filter = buildNameOrBarcodeSearchFilter("1L, 2本入り(お得)");
    // Reserved chars are safely contained inside a quoted value, not left to break or() parsing.
    expect(filter).toBe('name.ilike."%1L, 2本入り(お得)%",barcode.ilike."%1L, 2本入り(お得)%"');
  });

  test("ダブルクォートやバックスラッシュはエスケープされる", () => {
    expect(escapeOrFilterValue('a"b\\c')).toBe('a\\"b\\\\c');
  });
});
