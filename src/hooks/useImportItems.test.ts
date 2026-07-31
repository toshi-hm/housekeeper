import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import * as useItemLotsModule from "@/hooks/useItemLots";
import type { ImportItemInput } from "@/lib/export";

interface RpcResponse {
  data: unknown;
  error: unknown;
}

let rpcResponse: RpcResponse = { data: [], error: null };
const rpcMock = mock(() => Promise.resolve(rpcResponse));

mock.module("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
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

let syncItemAggregateMock: ReturnType<typeof spyOn<typeof useItemLotsModule, "syncItemAggregate">>;

beforeEach(() => {
  rpcResponse = { data: [], error: null };
  rpcMock.mockClear();
  syncItemAggregateMock = spyOn(useItemLotsModule, "syncItemAggregate").mockResolvedValue(
    undefined,
  );
});

afterEach(() => {
  mock.restore();
});

// #694: importItems now delegates the whole batch to a single atomic RPC
// (import_items_batch) instead of looping over separate Supabase calls per
// item — a mid-batch failure can no longer leave a partial, re-importable
// state behind. These tests exercise the client-side result aggregation and
// the post-commit aggregate resync, not the SQL transaction itself (that
// isn't runnable in this sandbox — see supabase/tests/database for the RLS
// pgTAP suite this project already uses for DB-level coverage).
//
// #693: ImportItemInput carries a `lots` array (not flat units/expiry_date
// fields) so a single item can restore multiple lots — see makeImportItem.
describe("importItems", () => {
  test("RPCの結果からcreated/updated/skippedの件数を集計する", async () => {
    rpcResponse = {
      data: [
        { item_id: "item-1", action: "created" },
        { item_id: "item-2", action: "updated" },
        { item_id: "item-3", action: "skipped" },
      ],
      error: null,
    };

    const result = await importItems({
      items: [makeImportItem(), makeImportItem(), makeImportItem()],
      duplicateStrategy: "overwrite",
    });

    expect(result).toEqual({ createdCount: 1, updatedCount: 1, skippedCount: 1 });
  });

  test("バッチ全体（複数ロットを含む）を1回のRPC呼び出しに渡す", async () => {
    const items = [
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
    ];
    await importItems({ items, duplicateStrategy: "skip" });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0]).toEqual([
      "import_items_batch",
      { p_items: items, p_duplicate_strategy: "skip" },
    ]);
  });

  test("skipped以外の各アイテムに対してsyncItemAggregateを呼ぶ（skippedは呼ばない）", async () => {
    rpcResponse = {
      data: [
        { item_id: "item-1", action: "created" },
        { item_id: "item-2", action: "updated" },
        { item_id: "item-3", action: "skipped" },
      ],
      error: null,
    };

    await importItems({
      items: [makeImportItem(), makeImportItem(), makeImportItem()],
      duplicateStrategy: "overwrite",
    });

    expect(syncItemAggregateMock).toHaveBeenCalledTimes(2);
    expect(syncItemAggregateMock).toHaveBeenCalledWith("item-1");
    expect(syncItemAggregateMock).toHaveBeenCalledWith("item-2");
    expect(syncItemAggregateMock).not.toHaveBeenCalledWith("item-3");
  });

  test("RPCがエラーを返した場合は何も反映されず例外を投げる", async () => {
    rpcResponse = { data: null, error: { message: "batch failed" } };

    await expect(
      importItems({ items: [makeImportItem()], duplicateStrategy: "skip" }),
    ).rejects.toThrow("batch failed");

    expect(syncItemAggregateMock).not.toHaveBeenCalled();
  });

  test("1件のsyncItemAggregate失敗が他のアイテムの集計結果に影響しない", async () => {
    rpcResponse = {
      data: [
        { item_id: "item-1", action: "created" },
        { item_id: "item-2", action: "created" },
      ],
      error: null,
    };
    syncItemAggregateMock.mockImplementation((id: string) =>
      id === "item-1" ? Promise.reject(new Error("sync failed")) : Promise.resolve(undefined),
    );

    const result = await importItems({
      items: [makeImportItem(), makeImportItem()],
      duplicateStrategy: "skip",
    });

    expect(result).toEqual({ createdCount: 2, updatedCount: 0, skippedCount: 0 });
    expect(syncItemAggregateMock).toHaveBeenCalledTimes(2);
  });
});
