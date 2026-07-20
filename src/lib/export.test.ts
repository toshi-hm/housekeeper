import { describe, expect, test } from "bun:test";

import type { Item } from "@/types/item";

import {
  buildConsumptionHistoryRows,
  buildExportFilename,
  buildPurchaseHistoryRows,
  DEFAULT_HISTORY_CSV_HEADER,
  DEFAULT_ITEMS_CSV_HEADER,
  filterHistoryRowsByPeriod,
  getPeriodStartDate,
  type HistoryExportRow,
  historyRowsToCSV,
  itemsToCSV,
  itemsToJSON,
} from "./export";

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "牛乳",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 2,
  content_amount: 1000,
  content_unit: "mL",
  opened_remaining: null,
  purchase_date: "2026-07-01",
  expiry_date: "2026-07-15",
  notes: null,
  image_path: null,
  minimum_stock: null,
  deleted_at: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

describe("itemsToCSV", () => {
  test("includes a BOM + the fixed Japanese header", () => {
    const csv = itemsToCSV([], [], []);
    expect(csv.startsWith("﻿")).toBe(true);
    const firstLine = csv.slice(1).split("\r\n")[0];
    expect(firstLine).toBe(DEFAULT_ITEMS_CSV_HEADER.join(","));
  });

  test("resolves category and location names by id", () => {
    const item = makeItem({ category_id: "cat-1", storage_location_id: "loc-1" });
    const csv = itemsToCSV(
      [item],
      [{ id: "cat-1", name: "食品" }],
      [{ id: "loc-1", name: "冷蔵庫" }],
    );
    const dataLine = csv.slice(1).split("\r\n")[1];
    expect(dataLine).toBe("牛乳,,食品,冷蔵庫,2,1000,mL,2026-07-15,2026-07-01,");
  });

  test("falls back to empty strings for missing category/location/barcode/notes", () => {
    const item = makeItem({
      category_id: null,
      storage_location_id: null,
      barcode: null,
      notes: null,
    });
    const csv = itemsToCSV([item], [], []);
    const dataLine = csv.slice(1).split("\r\n")[1];
    expect(dataLine).toBe("牛乳,,,,2,1000,mL,2026-07-15,2026-07-01,");
  });

  test("escapes fields containing commas, quotes, or newlines", () => {
    const item = makeItem({ name: '牛乳, 1L "特売"', notes: "line1\nline2" });
    const csv = itemsToCSV([item], [], []);
    const dataLine = csv.slice(1).split("\r\n")[1];
    expect(dataLine).toContain('"牛乳, 1L ""特売"""');
    expect(dataLine).toContain('"line1\nline2"');
  });

  test("a category id with no matching category resolves to an empty string", () => {
    const item = makeItem({ category_id: "missing-cat" });
    const csv = itemsToCSV([item], [], []);
    const dataLine = csv.slice(1).split("\r\n")[1];
    expect(dataLine).toBe("牛乳,,,,2,1000,mL,2026-07-15,2026-07-01,");
  });
});

describe("itemsToJSON", () => {
  test("produces {exported_at, version, items}", () => {
    const fixedNow = () => new Date("2026-07-19T12:00:00Z");
    const item = makeItem();
    const json = itemsToJSON([item], fixedNow);
    const parsed = JSON.parse(json) as { exported_at: string; version: number; items: Item[] };
    expect(parsed.exported_at).toBe("2026-07-19T12:00:00.000Z");
    expect(parsed.version).toBe(1);
    expect(parsed.items).toEqual([item]);
  });

  test("empty items array still produces a valid payload", () => {
    const json = itemsToJSON([]);
    const parsed = JSON.parse(json) as { items: Item[] };
    expect(parsed.items).toEqual([]);
  });
});

describe("buildConsumptionHistoryRows", () => {
  test("resolves item name, category name, and notes via lookup maps", () => {
    const rows = buildConsumptionHistoryRows(
      [
        {
          item_id: "item-1",
          delta_amount: 300,
          delta_unit: "mL",
          occurred_at: "2026-07-10T03:00:00Z",
        },
      ],
      new Map([["item-1", { name: "牛乳", category_id: "cat-1", notes: "毎朝飲む" }]]),
      new Map([["cat-1", "食品"]]),
    );
    expect(rows).toEqual([
      {
        type: "consumption",
        date: "2026-07-10",
        itemName: "牛乳",
        categoryName: "食品",
        amount: 300,
        unit: "mL",
        notes: "毎朝飲む",
      },
    ]);
  });

  test("unknown item_id resolves to empty strings instead of throwing", () => {
    const rows = buildConsumptionHistoryRows(
      [
        {
          item_id: "missing",
          delta_amount: 1,
          delta_unit: "個",
          occurred_at: "2026-07-10T00:00:00Z",
        },
      ],
      new Map(),
      new Map(),
    );
    expect(rows[0]?.itemName).toBe("");
    expect(rows[0]?.categoryName).toBe("");
  });
});

describe("buildPurchaseHistoryRows", () => {
  test("maps lots using the immutable purchased quantity", () => {
    const rows = buildPurchaseHistoryRows(
      [{ item_id: "item-1", purchased_units: 3, purchase_date: "2026-07-05" }],
      new Map([["item-1", { name: "卵", category_id: "cat-2", content_unit: "個" }]]),
      new Map([["cat-2", "食品"]]),
    );
    expect(rows).toEqual([
      {
        type: "purchase",
        date: "2026-07-05",
        itemName: "卵",
        categoryName: "食品",
        amount: 3,
        unit: "個",
        notes: "",
      },
    ]);
  });

  test("excludes lots without a purchase_date", () => {
    const rows = buildPurchaseHistoryRows(
      [{ item_id: "item-1", purchased_units: 1, purchase_date: null }],
      new Map(),
      new Map(),
    );
    expect(rows).toEqual([]);
  });
});

describe("getPeriodStartDate", () => {
  const fixedNow = () => new Date(2026, 6, 19); // 2026-07-19 local

  test("30d subtracts 30 days", () => {
    expect(getPeriodStartDate("30d", fixedNow)).toBe("2026-06-19");
  });

  test("90d subtracts 90 days", () => {
    expect(getPeriodStartDate("90d", fixedNow)).toBe("2026-04-20");
  });

  test("all returns null", () => {
    expect(getPeriodStartDate("all", fixedNow)).toBeNull();
  });
});

describe("filterHistoryRowsByPeriod", () => {
  const fixedNow = () => new Date(2026, 6, 19); // 2026-07-19 local
  const rows: HistoryExportRow[] = [
    {
      type: "consumption",
      date: "2026-07-18",
      itemName: "a",
      categoryName: "",
      amount: 1,
      unit: "個",
      notes: "",
    },
    {
      type: "consumption",
      date: "2026-05-01",
      itemName: "b",
      categoryName: "",
      amount: 1,
      unit: "個",
      notes: "",
    },
    {
      type: "purchase",
      date: "2025-01-01",
      itemName: "c",
      categoryName: "",
      amount: 1,
      unit: "個",
      notes: "",
    },
  ];

  test("30d keeps only rows within the last 30 days (inclusive)", () => {
    const result = filterHistoryRowsByPeriod(rows, "30d", fixedNow);
    expect(result.map((r) => r.itemName)).toEqual(["a"]);
  });

  test("90d keeps rows within the last 90 days", () => {
    const result = filterHistoryRowsByPeriod(rows, "90d", fixedNow);
    expect(result.map((r) => r.itemName)).toEqual(["a", "b"]);
  });

  test("all keeps every row unfiltered", () => {
    const result = filterHistoryRowsByPeriod(rows, "all", fixedNow);
    expect(result).toHaveLength(3);
  });
});

describe("historyRowsToCSV", () => {
  test("includes a BOM + the fixed Japanese header with 種別 first", () => {
    const csv = historyRowsToCSV([]);
    expect(csv.startsWith("﻿")).toBe(true);
    const firstLine = csv.slice(1).split("\r\n")[0];
    expect(firstLine).toBe(DEFAULT_HISTORY_CSV_HEADER.join(","));
  });

  test("sorts rows by date descending", () => {
    const rows: HistoryExportRow[] = [
      {
        type: "consumption",
        date: "2026-01-01",
        itemName: "old",
        categoryName: "",
        amount: 1,
        unit: "個",
        notes: "",
      },
      {
        type: "purchase",
        date: "2026-06-01",
        itemName: "new",
        categoryName: "",
        amount: 1,
        unit: "個",
        notes: "",
      },
    ];
    const csv = historyRowsToCSV(rows);
    const lines = csv.slice(1).split("\r\n").slice(1);
    expect(lines[0]).toContain("new");
    expect(lines[1]).toContain("old");
  });

  test("translates type to the default Japanese labels", () => {
    const rows: HistoryExportRow[] = [
      {
        type: "consumption",
        date: "2026-01-01",
        itemName: "x",
        categoryName: "",
        amount: 1,
        unit: "個",
        notes: "",
      },
      {
        type: "purchase",
        date: "2026-01-02",
        itemName: "y",
        categoryName: "",
        amount: 1,
        unit: "個",
        notes: "",
      },
    ];
    const csv = historyRowsToCSV(rows);
    const lines = csv.slice(1).split("\r\n").slice(1);
    expect(lines[0]?.startsWith("購入,")).toBe(true);
    expect(lines[1]?.startsWith("消費,")).toBe(true);
  });
});

describe("buildExportFilename", () => {
  test("formats base-YYYYMMDD.ext", () => {
    const fixedNow = () => new Date(2026, 6, 9); // 2026-07-09 local
    expect(buildExportFilename("items", "csv", fixedNow)).toBe("items-20260709.csv");
  });
});
