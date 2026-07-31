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
  ImportParseError,
  itemsToCSV,
  itemsToJSON,
  jsonToItems,
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

  test("neutralizes formula-triggering leading characters to prevent CSV injection (#677)", () => {
    const item = makeItem({ name: "=HYPERLINK(evil.example)", notes: "+CMD|'/c calc'!A1" });
    const csv = itemsToCSV([item], [], []);
    const dataLine = csv.slice(1).split("\r\n")[1] ?? "";
    expect(dataLine).toContain("'=HYPERLINK(evil.example)");
    expect(dataLine).toContain("'+CMD|'/c calc'!A1");
    expect(dataLine).not.toContain(",=HYPERLINK");
  });

  test("also neutralizes '-' and '@' leading characters", () => {
    const csvMinus = itemsToCSV([makeItem({ name: "-2+3", notes: null })], [], []);
    expect(csvMinus).toContain("'-2+3");
    const csvAt = itemsToCSV([makeItem({ name: "@SUM(1,1)", notes: null })], [], []);
    expect(csvAt).toContain("'@SUM(1,1)");
  });

  test("does not alter fields that don't start with a formula-trigger character", () => {
    const item = makeItem({ name: "牛乳（1本）" });
    const csv = itemsToCSV([item], [], []);
    const dataLine = csv.slice(1).split("\r\n")[1];
    expect(dataLine).toBe("牛乳（1本）,,,,2,1000,mL,2026-07-15,2026-07-01,");
  });
});

describe("itemsToJSON", () => {
  test("produces {exported_at, version: 2, items} with a lots array per item", () => {
    const fixedNow = () => new Date("2026-07-19T12:00:00Z");
    const item = makeItem();
    const lots = new Map([
      [
        item.id,
        [
          {
            units: 1,
            opened_remaining: null,
            unit_price: 200,
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
      ],
    ]);
    const json = itemsToJSON([item], lots, fixedNow);
    const parsed = JSON.parse(json) as {
      exported_at: string;
      version: number;
      items: { name: string; lots: unknown[] }[];
    };
    expect(parsed.exported_at).toBe("2026-07-19T12:00:00.000Z");
    expect(parsed.version).toBe(2);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.name).toBe(item.name);
    // #693: both lots (with distinct expiry dates) must survive the export,
    // not just the earliest one that would have won on the aggregated row.
    expect(parsed.items[0]?.lots).toEqual(lots.get(item.id));
  });

  test("falls back to the item's own aggregate as a single lot when no lots are supplied", () => {
    const item = makeItem();
    const json = itemsToJSON([item], new Map());
    const parsed = JSON.parse(json) as { items: { lots: unknown[] }[] };
    expect(parsed.items[0]?.lots).toEqual([
      {
        units: item.units,
        opened_remaining: item.opened_remaining,
        unit_price: null,
        purchase_date: item.purchase_date,
        expiry_date: item.expiry_date,
      },
    ]);
  });

  test("empty items array still produces a valid payload", () => {
    const json = itemsToJSON([], new Map());
    const parsed = JSON.parse(json) as { items: unknown[] };
    expect(parsed.items).toEqual([]);
  });
});

describe("jsonToItems", () => {
  test("round-trips a valid itemsToJSON (v2) payload, dropping category/location references", () => {
    const item = makeItem({
      barcode: "1234567890123",
      category_id: "cat-1",
      storage_location_id: "loc-1",
    });
    const lots = new Map([
      [
        item.id,
        [
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
      ],
    ]);
    const json = itemsToJSON([item], lots);
    const result = jsonToItems(json);
    // category_id / storage_location_id are intentionally not carried over —
    // they'd reference IDs that may not exist in the importing project (#657).
    expect(result).toEqual([
      {
        name: item.name,
        barcode: item.barcode,
        content_amount: item.content_amount,
        content_unit: item.content_unit,
        notes: item.notes,
        minimum_stock: item.minimum_stock,
        auto_reorder: false,
        reorder_threshold: null,
        lots: lots.get(item.id),
      },
    ]);
  });

  test("reads an old v1 (aggregate-only) backup, synthesizing a single lot", () => {
    const payload = {
      exported_at: "2026-07-19T00:00:00Z",
      version: 1,
      items: [
        {
          name: "牛乳",
          barcode: "123",
          units: 2,
          content_amount: 1000,
          content_unit: "mL",
          opened_remaining: null,
          purchase_date: "2026-07-01",
          expiry_date: "2026-07-15",
          notes: null,
          minimum_stock: null,
        },
      ],
    };
    const result = jsonToItems(JSON.stringify(payload));
    expect(result).toEqual([
      {
        name: "牛乳",
        barcode: "123",
        content_amount: 1000,
        content_unit: "mL",
        notes: null,
        minimum_stock: null,
        auto_reorder: undefined,
        reorder_threshold: undefined,
        lots: [
          {
            units: 2,
            opened_remaining: null,
            unit_price: null,
            purchase_date: "2026-07-01",
            expiry_date: "2026-07-15",
          },
        ],
      },
    ]);
  });

  test("throws ImportParseError('invalid_json') for text that isn't JSON", () => {
    expect(() => jsonToItems("not json")).toThrow(ImportParseError);
    try {
      jsonToItems("not json");
    } catch (err) {
      expect(err).toBeInstanceOf(ImportParseError);
      expect((err as ImportParseError).reason).toBe("invalid_json");
    }
  });

  test("throws ImportParseError('invalid_format') for valid JSON in the wrong shape", () => {
    expect(() => jsonToItems(JSON.stringify({ foo: "bar" }))).toThrow(ImportParseError);
    try {
      jsonToItems(JSON.stringify({ version: 2, items: [] }));
    } catch (err) {
      expect(err).toBeInstanceOf(ImportParseError);
      expect((err as ImportParseError).reason).toBe("invalid_format");
    }
  });

  test("rejects an item missing a required field", () => {
    const payload = { exported_at: "2026-07-19T00:00:00Z", version: 1, items: [{ name: "" }] };
    expect(() => jsonToItems(JSON.stringify(payload))).toThrow(ImportParseError);
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
