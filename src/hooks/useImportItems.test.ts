import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import * as useItemLotsModule from "@/hooks/useItemLots";
import type { ImportItemInput } from "@/lib/export";

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
    is: chainMethod("is"),
    not: chainMethod("not"),
    range: chainMethod("range"),
    insert: chainMethod("insert"),
    update: chainMethod("update"),
    delete: chainMethod("delete"),
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

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { importItems } = await import("@/hooks/useImportItems");

const makeImportItem = (overrides: Partial<ImportItemInput> = {}): ImportItemInput => ({
  name: "牛乳",
  barcode: null,
  content_amount: 1000,
  content_unit: "mL",
  notes: null,
  minimum_stock: null,
  lots: [
    { units: 1, opened_remaining: null, unit_price: null, purchase_date: null, expiry_date: null },
  ],
  ...overrides,
});

type CreateLotResult = Awaited<ReturnType<typeof useItemLotsModule.createLot>>;

let createLotMock: ReturnType<typeof spyOn<typeof useItemLotsModule, "createLot">>;
let syncItemAggregateMock: ReturnType<typeof spyOn<typeof useItemLotsModule, "syncItemAggregate">>;

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
  createLotMock = spyOn(useItemLotsModule, "createLot").mockResolvedValue({
    id: "lot-1",
  } as CreateLotResult);
  syncItemAggregateMock = spyOn(useItemLotsModule, "syncItemAggregate").mockResolvedValue(
    undefined,
  );
});

afterEach(() => {
  mock.restore();
});

describe("importItems", () => {
  test("重複がなければ新規アイテムとロットを作成する", async () => {
    responseQueues.items = [
      { data: [], error: null }, // バーコード重複検出用の既存アイテム一覧取得
      { data: { id: "new-item-1" }, error: null }, // insert().select("id").single()
    ];

    const result = await importItems({
      items: [makeImportItem({ barcode: "123" })],
      duplicateStrategy: "skip",
    });

    expect(result).toEqual({ createdCount: 1, updatedCount: 0, skippedCount: 0 });
    const insertCall = callLog.find((c) => c.table === "items" && c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ user_id: "user-1", name: "牛乳", barcode: "123" });
    expect(createLotMock).toHaveBeenCalledTimes(1);
    expect(createLotMock.mock.calls[0]?.[1]).toBe("new-item-1");
    expect(syncItemAggregateMock).toHaveBeenCalledWith("new-item-1");
  });

  test("バーコードが一致し strategy が skip なら新規作成せずスキップする", async () => {
    responseQueues.items = [{ data: [{ id: "existing-1", barcode: "123" }], error: null }];

    const result = await importItems({
      items: [makeImportItem({ barcode: "123" })],
      duplicateStrategy: "skip",
    });

    expect(result).toEqual({ createdCount: 0, updatedCount: 0, skippedCount: 1 });
    const insertCall = callLog.find((c) => c.table === "items" && c.method === "insert");
    expect(insertCall).toBeUndefined();
    expect(createLotMock).not.toHaveBeenCalled();
  });

  test("バーコードが一致し strategy が overwrite なら既存ロットを入れ替えて更新する", async () => {
    responseQueues.items = [{ data: [{ id: "existing-1", barcode: "123" }], error: null }];

    const result = await importItems({
      items: [makeImportItem({ barcode: "123", name: "新しい名前" })],
      duplicateStrategy: "overwrite",
    });

    expect(result).toEqual({ createdCount: 0, updatedCount: 1, skippedCount: 0 });
    const lotDelete = callLog.find((c) => c.table === "item_lots" && c.method === "delete");
    expect(lotDelete).toBeTruthy();
    expect(createLotMock).toHaveBeenCalledTimes(1);
    expect(createLotMock.mock.calls[0]?.[1]).toBe("existing-1");
    const itemsUpdate = callLog.find((c) => c.table === "items" && c.method === "update");
    expect(itemsUpdate?.args[0]).toMatchObject({ name: "新しい名前" });
    expect(syncItemAggregateMock).toHaveBeenCalledWith("existing-1");
  });

  test("バーコードが一致しても strategy が duplicate なら新規アイテムとして追加する", async () => {
    responseQueues.items = [
      { data: [{ id: "existing-1", barcode: "123" }], error: null },
      { data: { id: "new-item-2" }, error: null },
    ];

    const result = await importItems({
      items: [makeImportItem({ barcode: "123" })],
      duplicateStrategy: "duplicate",
    });

    expect(result).toEqual({ createdCount: 1, updatedCount: 0, skippedCount: 0 });
    const insertCall = callLog.find((c) => c.table === "items" && c.method === "insert");
    expect(insertCall).toBeTruthy();
  });

  // #693: JSONバックアップは複数ロット（期限日違い等）を保持できるため、
  // インポート時にすべてのロットを個別に復元しなければならない。
  test("複数ロットを持つアイテムは、新規作成時にロットごとにcreateLotを呼ぶ", async () => {
    responseQueues.items = [
      { data: [], error: null },
      { data: { id: "new-item-1" }, error: null },
    ];

    const result = await importItems({
      items: [
        makeImportItem({
          barcode: "123",
          lots: [
            {
              units: 1,
              opened_remaining: null,
              unit_price: null,
              purchase_date: "2026-07-01",
              expiry_date: "2026-08-01",
            },
            {
              units: 1,
              opened_remaining: null,
              unit_price: null,
              purchase_date: "2026-07-10",
              expiry_date: "2026-09-15",
            },
          ],
        }),
      ],
      duplicateStrategy: "skip",
    });

    expect(result).toEqual({ createdCount: 1, updatedCount: 0, skippedCount: 0 });
    expect(createLotMock).toHaveBeenCalledTimes(2);
    expect(createLotMock.mock.calls[0]?.[2]).toMatchObject({ expiry_date: "2026-08-01" });
    expect(createLotMock.mock.calls[1]?.[2]).toMatchObject({ expiry_date: "2026-09-15" });
  });

  test("複数ロットを持つアイテムは、overwrite時もロットごとにcreateLotを呼ぶ", async () => {
    responseQueues.items = [{ data: [{ id: "existing-1", barcode: "123" }], error: null }];

    const result = await importItems({
      items: [
        makeImportItem({
          barcode: "123",
          lots: [
            {
              units: 1,
              opened_remaining: null,
              unit_price: null,
              purchase_date: "2026-07-01",
              expiry_date: "2026-08-01",
            },
            {
              units: 1,
              opened_remaining: null,
              unit_price: null,
              purchase_date: "2026-07-10",
              expiry_date: "2026-09-15",
            },
          ],
        }),
      ],
      duplicateStrategy: "overwrite",
    });

    expect(result).toEqual({ createdCount: 0, updatedCount: 1, skippedCount: 0 });
    expect(createLotMock).toHaveBeenCalledTimes(2);
  });

  test("同一バーコードが複数行に含まれる場合、2件目以降は今回作成した行を重複として扱う", async () => {
    responseQueues.items = [
      { data: [], error: null }, // バーコード重複検出用の既存アイテム一覧取得
      { data: { id: "new-item-1" }, error: null }, // 1件目: insert
    ];

    const result = await importItems({
      items: [
        makeImportItem({ barcode: "999", name: "1件目" }),
        makeImportItem({ barcode: "999", name: "2件目" }),
      ],
      duplicateStrategy: "skip",
    });

    expect(result).toEqual({ createdCount: 1, updatedCount: 0, skippedCount: 1 });
  });
});
