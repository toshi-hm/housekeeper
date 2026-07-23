import { describe, expect, test } from "bun:test";

import {
  computeCategoryStats,
  computeCategoryValueStats,
  computeConsumptionPaceForecast,
  computeConsumptionSpeedRanking,
  computeExpiryDistribution,
  computeForecastAlerts,
  computeItemConsumptionPace,
  computeMonthlyConsumption,
  type ItemConsumptionLogEntry,
  type LotValueRow,
  type RawLog,
} from "../../src/types/stats";

// helpers
const today = new Date();
today.setHours(0, 0, 0, 0);
const fmt = (d: Date) => d.toISOString().split("T")[0] as string;
const addDays = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

// --- computeCategoryStats ---

describe("computeCategoryStats", () => {
  test("empty items → empty stats", () => {
    expect(computeCategoryStats([], {})).toEqual([]);
  });

  test("groups by category_id and resolves names", () => {
    const items = [
      { category_id: "cat-1", units: 1 },
      { category_id: "cat-1", units: 1 },
      { category_id: "cat-2", units: 1 },
    ];
    const categoryMap = { "cat-1": "Food", "cat-2": "Drink" };
    const result = computeCategoryStats(items, categoryMap);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ categoryId: "cat-1", name: "Food", count: 2 });
    expect(result[1]).toEqual({ categoryId: "cat-2", name: "Drink", count: 1 });
  });

  test("null category_id → __uncategorized__", () => {
    const items = [
      { category_id: null, units: 1 },
      { category_id: null, units: 1 },
    ];
    const result = computeCategoryStats(items, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ categoryId: null, name: "__uncategorized__", count: 2 });
  });

  test("unknown category_id → '?'", () => {
    const items = [{ category_id: "unknown-id", units: 1 }];
    const result = computeCategoryStats(items, {});
    expect(result[0]?.name).toBe("?");
  });

  test("sorted descending by count", () => {
    const items = [
      { category_id: "a", units: 1 },
      { category_id: "b", units: 1 },
      { category_id: "b", units: 1 },
      { category_id: "b", units: 1 },
    ];
    const result = computeCategoryStats(items, { a: "A", b: "B" });
    expect(result[0]?.categoryId).toBe("b");
    expect(result[1]?.categoryId).toBe("a");
  });

  test("skips items with units=0 (used-up items excluded from counts)", () => {
    const items = [
      { category_id: "cat-1", units: 0 },
      { category_id: "cat-1", units: 1 },
      { category_id: "cat-2", units: 0 },
    ];
    const categoryMap = { "cat-1": "Food", "cat-2": "Drink" };
    const result = computeCategoryStats(items, categoryMap);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ categoryId: "cat-1", name: "Food", count: 1 });
  });
});

// --- computeCategoryValueStats ---

describe("computeCategoryValueStats", () => {
  test("empty lots → empty stats", () => {
    expect(computeCategoryValueStats([], {}, {}, {})).toEqual([]);
  });

  test("sums units × unit_price grouped by item's category", () => {
    const lots: LotValueRow[] = [
      { item_id: "item-1", units: 2, unit_price: 100 },
      { item_id: "item-2", units: 1, unit_price: 300 },
    ];
    const itemCategoryMap = { "item-1": "cat-1", "item-2": "cat-1" };
    const itemContentAmountMap = { "item-1": 100, "item-2": 100 };
    const categoryMap = { "cat-1": "Food" };
    const result = computeCategoryValueStats(
      lots,
      itemCategoryMap,
      itemContentAmountMap,
      categoryMap,
    );
    expect(result).toEqual([{ categoryId: "cat-1", name: "Food", value: 500 }]);
  });

  test("excludes lots with unit_price = null (未設定)", () => {
    const lots: LotValueRow[] = [
      { item_id: "item-1", units: 2, unit_price: null },
      { item_id: "item-2", units: 1, unit_price: 50 },
    ];
    const itemCategoryMap = { "item-1": "cat-1", "item-2": "cat-1" };
    const result = computeCategoryValueStats(
      lots,
      itemCategoryMap,
      { "item-1": 100, "item-2": 100 },
      { "cat-1": "Food" },
    );
    expect(result).toEqual([{ categoryId: "cat-1", name: "Food", value: 50 }]);
  });

  test("excludes lots with units <= 0", () => {
    const lots: LotValueRow[] = [{ item_id: "item-1", units: 0, unit_price: 100 }];
    const result = computeCategoryValueStats(
      lots,
      { "item-1": "cat-1" },
      { "item-1": 100 },
      { "cat-1": "Food" },
    );
    expect(result).toEqual([]);
  });

  test("null category_id (item has no category) → __uncategorized__", () => {
    const lots: LotValueRow[] = [{ item_id: "item-1", units: 1, unit_price: 200 }];
    const result = computeCategoryValueStats(lots, { "item-1": null }, { "item-1": 100 }, {});
    expect(result).toEqual([{ categoryId: null, name: "__uncategorized__", value: 200 }]);
  });

  test("item missing from itemCategoryMap → excluded as deleted or archived", () => {
    const lots: LotValueRow[] = [{ item_id: "item-unknown", units: 1, unit_price: 200 }];
    const result = computeCategoryValueStats(lots, {}, {}, {});
    expect(result).toEqual([]);
  });

  test("sorted descending by value", () => {
    const lots: LotValueRow[] = [
      { item_id: "item-1", units: 1, unit_price: 100 },
      { item_id: "item-2", units: 1, unit_price: 500 },
    ];
    const itemCategoryMap = { "item-1": "cat-a", "item-2": "cat-b" };
    const itemContentAmountMap = { "item-1": 100, "item-2": 100 };
    const categoryMap = { "cat-a": "A", "cat-b": "B" };
    const result = computeCategoryValueStats(
      lots,
      itemCategoryMap,
      itemContentAmountMap,
      categoryMap,
    );
    expect(result[0]?.categoryId).toBe("cat-b");
    expect(result[1]?.categoryId).toBe("cat-a");
  });

  test("prorates opened lots using the item's content amount", () => {
    const lots: LotValueRow[] = [
      { item_id: "item-1", units: 2, opened_remaining: 25, unit_price: 200 },
    ];
    const result = computeCategoryValueStats(
      lots,
      { "item-1": "cat-a" },
      { "item-1": 100 },
      { "cat-a": "A" },
    );
    expect(result).toEqual([{ categoryId: "cat-a", name: "A", value: 250 }]);
  });
});

// --- computeExpiryDistribution ---

describe("computeExpiryDistribution", () => {
  test("empty items → empty result", () => {
    expect(computeExpiryDistribution([])).toEqual([]);
  });

  test("skips items with units=0", () => {
    const items = [{ units: 0, expiry_date: "2000-01-01" }];
    expect(computeExpiryDistribution(items)).toEqual([]);
  });

  test("counts expired items", () => {
    const items = [
      { units: 1, expiry_date: "2000-01-01" },
      { units: 2, expiry_date: "2000-01-02" },
    ];
    const result = computeExpiryDistribution(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ status: "expired", count: 2 });
  });

  test("counts unknown expiry items (no expiry date)", () => {
    const items = [
      { units: 1, expiry_date: null },
      { units: 1, expiry_date: undefined },
    ];
    const result = computeExpiryDistribution(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ status: "unknown", count: 2 });
  });

  test("counts expiring-soon using warningDays", () => {
    const items = [{ units: 1, expiry_date: fmt(addDays(1)) }];
    const result = computeExpiryDistribution(items, 3);
    expect(result[0]?.status).toBe("expiring-soon");
  });

  test("respects order: expired, expiring-soon, ok, unknown", () => {
    const items = [
      { units: 1, expiry_date: null },
      { units: 1, expiry_date: "2000-01-01" },
      { units: 1, expiry_date: fmt(addDays(100)) },
    ];
    const result = computeExpiryDistribution(items, 3);
    expect(result.map((r) => r.status)).toEqual(["expired", "ok", "unknown"]);
  });
});

// --- computeMonthlyConsumption ---

describe("computeMonthlyConsumption", () => {
  const fixedNow = new Date(2026, 3, 30); // April 2026

  test("returns 6 entries by default", () => {
    const result = computeMonthlyConsumption([], 6, fixedNow);
    expect(result).toHaveLength(6);
  });

  test("returns correct month labels in order", () => {
    const result = computeMonthlyConsumption([], 3, fixedNow);
    expect(result.map((r) => r.month)).toEqual(["2026/02", "2026/03", "2026/04"]);
  });

  test("empty totals for months with no logs", () => {
    const result = computeMonthlyConsumption([], 2, fixedNow);
    expect(result[0]?.totals).toEqual([]);
  });

  test("sums delta_amount for the correct month", () => {
    const logs: RawLog[] = [
      { delta_amount: 100, delta_unit: "mL", occurred_at: "2026-04-01T10:00:00Z" },
      { delta_amount: 200, delta_unit: "mL", occurred_at: "2026-04-15T10:00:00Z" },
    ];
    const result = computeMonthlyConsumption(logs, 1, fixedNow);
    expect(result[0]?.totals).toEqual([{ unit: "mL", total: 300 }]);
  });

  test("ignores logs from other months", () => {
    const logs: RawLog[] = [
      { delta_amount: 500, delta_unit: "g", occurred_at: "2025-12-01T10:00:00Z" },
    ];
    const result = computeMonthlyConsumption(logs, 1, fixedNow);
    expect(result[0]?.totals).toEqual([]);
  });

  test("keeps every unit as a separate series when multiple units occur in a month", () => {
    const logs: RawLog[] = [
      { delta_amount: 50, delta_unit: "g", occurred_at: "2026-04-10T00:00:00Z" },
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-04-11T00:00:00Z" },
    ];
    const result = computeMonthlyConsumption(logs, 1, fixedNow);
    // Sorted descending by total, but both units must be present — neither
    // is discarded just because it isn't the largest.
    expect(result[0]?.totals).toEqual([
      { unit: "mL", total: 300 },
      { unit: "g", total: 50 },
    ]);
  });

  test("handles three or more mixed units in a single month without dropping any", () => {
    const logs: RawLog[] = [
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-04-01T00:00:00Z" },
      { delta_amount: 150, delta_unit: "g", occurred_at: "2026-04-02T00:00:00Z" },
      { delta_amount: 4, delta_unit: "個", occurred_at: "2026-04-03T00:00:00Z" },
    ];
    const result = computeMonthlyConsumption(logs, 1, fixedNow);
    expect(result[0]?.totals).toHaveLength(3);
    const units = result[0]?.totals.map((t) => t.unit);
    expect(units).toContain("mL");
    expect(units).toContain("g");
    expect(units).toContain("個");
  });

  test("rounds totals to 2 decimal places", () => {
    const logs: RawLog[] = [
      { delta_amount: 0.1, delta_unit: "g", occurred_at: "2026-04-01T00:00:00Z" },
      { delta_amount: 0.2, delta_unit: "g", occurred_at: "2026-04-02T00:00:00Z" },
    ];
    const result = computeMonthlyConsumption(logs, 1, fixedNow);
    expect(result[0]?.totals).toEqual([{ unit: "g", total: 0.3 }]);
  });
});

// --- computeConsumptionPaceForecast ---

describe("computeConsumptionPaceForecast", () => {
  const now = new Date("2026-04-30T12:00:00Z");

  test("no logs → insufficient data (null rate/days, logCount 0)", () => {
    const result = computeConsumptionPaceForecast([], 10, "個", 30, now);
    expect(result).toEqual({ dailyRate: null, predictedRemainingDays: null, logCount: 0 });
  });

  test("currentStock <= 0 → predictedRemainingDays is 0 regardless of logs", () => {
    const logs = [{ delta_amount: 5, delta_unit: "個", occurred_at: "2026-04-25T00:00:00Z" }];
    const result = computeConsumptionPaceForecast(logs, 0, "個", 30, now);
    expect(result.predictedRemainingDays).toBe(0);
    expect(result.dailyRate).toBeNull();
  });

  test("fewer than 2 logs in the window → insufficient data but logCount is reported", () => {
    const logs = [{ delta_amount: 5, delta_unit: "個", occurred_at: "2026-04-25T00:00:00Z" }];
    const result = computeConsumptionPaceForecast(logs, 10, "個", 30, now);
    expect(result.dailyRate).toBeNull();
    expect(result.predictedRemainingDays).toBeNull();
    expect(result.logCount).toBe(1);
  });

  test("computes dailyRate and floors predictedRemainingDays", () => {
    const logs = [
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-01T00:00:00Z" },
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-10T00:00:00Z" },
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-20T00:00:00Z" },
    ];
    // total 30 over a 30-day lookback → 1/day; stock 15 → 15 days remaining
    const result = computeConsumptionPaceForecast(logs, 15, "個", 30, now);
    expect(result.dailyRate).toBe(1);
    expect(result.predictedRemainingDays).toBe(15);
    expect(result.logCount).toBe(3);
  });

  test("excludes logs outside the lookback window", () => {
    const logs = [
      { delta_amount: 1000, delta_unit: "個", occurred_at: "2026-01-01T00:00:00Z" }, // way before cutoff
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-05T00:00:00Z" },
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-15T00:00:00Z" },
    ];
    const result = computeConsumptionPaceForecast(logs, 100, "個", 30, now);
    expect(result.logCount).toBe(2);
    expect(result.dailyRate).toBeCloseTo(20 / 30, 5);
  });

  test("excludes logs from the future", () => {
    const logs = [
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-10T00:00:00Z" },
      { delta_amount: 10, delta_unit: "個", occurred_at: "2026-05-15T00:00:00Z" }, // after `now`
    ];
    const result = computeConsumptionPaceForecast(logs, 100, "個", 30, now);
    expect(result.logCount).toBe(1);
  });

  test("ignores historical logs recorded with a different unit", () => {
    const logs = [
      { delta_amount: 1000, delta_unit: "mL", occurred_at: "2026-04-20T00:00:00Z" },
      { delta_amount: 1, delta_unit: "個", occurred_at: "2026-04-22T00:00:00Z" },
      { delta_amount: 1, delta_unit: "個", occurred_at: "2026-04-25T00:00:00Z" },
    ];
    const result = computeConsumptionPaceForecast(logs, 10, "個", 30, now);
    expect(result.logCount).toBe(2);
    expect(result.dailyRate).toBeCloseTo(2 / 30, 5);
  });
});

// --- computeConsumptionSpeedRanking ---

describe("computeConsumptionSpeedRanking", () => {
  const now = new Date("2026-04-30T12:00:00Z");
  const windowDays = 10;
  const itemUnits = new Map([
    ["item-a", "個"],
    ["item-b", "個"],
    ["item-c", "個"],
    ["item-d", "個"],
    ["item-e", "個"],
    ["item-f", "個"],
  ]);

  const logs: ItemConsumptionLogEntry[] = [
    // item-a: recent 20 (accelerating vs prior 5)
    { item_id: "item-a", delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-22T00:00:00Z" },
    { item_id: "item-a", delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-26T00:00:00Z" },
    { item_id: "item-a", delta_amount: 5, delta_unit: "個", occurred_at: "2026-04-12T00:00:00Z" },
    // item-b: recent 5 (decelerating vs prior 20)
    { item_id: "item-b", delta_amount: 5, delta_unit: "個", occurred_at: "2026-04-24T00:00:00Z" },
    { item_id: "item-b", delta_amount: 20, delta_unit: "個", occurred_at: "2026-04-13T00:00:00Z" },
    // item-c: recent 10 (steady vs prior 10)
    { item_id: "item-c", delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-23T00:00:00Z" },
    { item_id: "item-c", delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-14T00:00:00Z" },
    // item-d: recent 3, no prior logs → insufficient-data
    { item_id: "item-d", delta_amount: 3, delta_unit: "個", occurred_at: "2026-04-21T00:00:00Z" },
    // item-e: only logs older than 2*windowDays → should not appear at all
    { item_id: "item-e", delta_amount: 999, delta_unit: "個", occurred_at: "2026-03-01T00:00:00Z" },
    // item-f: only a future log → should not appear at all
    { item_id: "item-f", delta_amount: 999, delta_unit: "個", occurred_at: "2026-05-15T00:00:00Z" },
  ];

  test("returns [] for no logs", () => {
    expect(computeConsumptionSpeedRanking([], itemUnits, windowDays, now)).toEqual([]);
  });

  test("sorts descending by recent daily rate", () => {
    const result = computeConsumptionSpeedRanking(logs, itemUnits, windowDays, now);
    expect(result.map((r) => r.itemId)).toEqual(["item-a", "item-c", "item-b", "item-d"]);
  });

  test("classifies trend by comparing recent vs prior window", () => {
    const result = computeConsumptionSpeedRanking(logs, itemUnits, windowDays, now);
    const byId = Object.fromEntries(result.map((r) => [r.itemId, r]));
    expect(byId["item-a"]?.trend).toBe("accelerating");
    expect(byId["item-b"]?.trend).toBe("decelerating");
    expect(byId["item-c"]?.trend).toBe("steady");
    expect(byId["item-d"]?.trend).toBe("insufficient-data");
  });

  test("ignores items with no logs in the recent window", () => {
    const result = computeConsumptionSpeedRanking(logs, itemUnits, windowDays, now);
    expect(result.some((r) => r.itemId === "item-e")).toBe(false);
    expect(result.some((r) => r.itemId === "item-f")).toBe(false);
  });

  test("ignores logs whose unit differs from the item's current unit", () => {
    const mixedLogs: ItemConsumptionLogEntry[] = [
      {
        item_id: "item-a",
        delta_amount: 1000,
        delta_unit: "mL",
        occurred_at: "2026-04-25T00:00:00Z",
      },
      { item_id: "item-a", delta_amount: 2, delta_unit: "個", occurred_at: "2026-04-26T00:00:00Z" },
    ];
    const result = computeConsumptionSpeedRanking(mixedLogs, itemUnits, windowDays, now);
    expect(result[0]?.dailyRate).toBe(0.2);
    expect(result[0]?.unit).toBe("個");
  });
});

// --- computeForecastAlerts ---

describe("computeForecastAlerts", () => {
  const now = new Date("2026-04-30T12:00:00Z");
  const lookbackDays = 10;

  test("returns [] when there are no items", () => {
    expect(computeForecastAlerts([], [], 7, lookbackDays, now)).toEqual([]);
  });

  test("skips items that are already out of stock", () => {
    const items = [
      { id: "empty", units: 0, content_amount: 1, content_unit: "個", opened_remaining: null },
    ];
    const logs: ItemConsumptionLogEntry[] = [
      { item_id: "empty", delta_amount: 10, delta_unit: "個", occurred_at: "2026-04-25T00:00:00Z" },
    ];
    expect(computeForecastAlerts(items, logs, 7, lookbackDays, now)).toEqual([]);
  });

  test("excludes items with insufficient consumption data", () => {
    const items = [
      {
        id: "no-history",
        units: 10,
        content_amount: 1,
        content_unit: "個",
        opened_remaining: null,
      },
    ];
    expect(computeForecastAlerts(items, [], 7, lookbackDays, now)).toEqual([]);
  });

  test("excludes items whose predicted remaining days exceed the threshold", () => {
    // stock 6, total consumed 2 over 10 days → dailyRate 0.2 → 30 days remaining
    const items = [
      { id: "slow-mover", units: 3, content_amount: 2, content_unit: "個", opened_remaining: null },
    ];
    const logs: ItemConsumptionLogEntry[] = [
      {
        item_id: "slow-mover",
        delta_amount: 1,
        delta_unit: "個",
        occurred_at: "2026-04-24T00:00:00Z",
      },
      {
        item_id: "slow-mover",
        delta_amount: 1,
        delta_unit: "個",
        occurred_at: "2026-04-28T00:00:00Z",
      },
    ];
    expect(computeForecastAlerts(items, logs, 7, lookbackDays, now)).toEqual([]);
  });

  test("includes and sorts items within the threshold by urgency (fewest days first)", () => {
    const items = [
      { id: "five-days", units: 5, content_amount: 1, content_unit: "個", opened_remaining: null },
      { id: "two-days", units: 2, content_amount: 1, content_unit: "個", opened_remaining: null },
    ];
    const logs: ItemConsumptionLogEntry[] = [
      // five-days: stock 5, total 10 over 10 days → 1/day → 5 days remaining
      {
        item_id: "five-days",
        delta_amount: 5,
        delta_unit: "個",
        occurred_at: "2026-04-24T00:00:00Z",
      },
      {
        item_id: "five-days",
        delta_amount: 5,
        delta_unit: "個",
        occurred_at: "2026-04-28T00:00:00Z",
      },
      // two-days: stock 2, total 8 over 10 days → 0.8/day → floor(2/0.8) = 2 days remaining
      {
        item_id: "two-days",
        delta_amount: 4,
        delta_unit: "個",
        occurred_at: "2026-04-24T00:00:00Z",
      },
      {
        item_id: "two-days",
        delta_amount: 4,
        delta_unit: "個",
        occurred_at: "2026-04-28T00:00:00Z",
      },
    ];
    const result = computeForecastAlerts(items, logs, 7, lookbackDays, now);
    expect(result).toEqual([
      { itemId: "two-days", predictedRemainingDays: 2 },
      { itemId: "five-days", predictedRemainingDays: 5 },
    ]);
  });
});

// --- computeItemConsumptionPace ---

describe("computeItemConsumptionPace", () => {
  const fixedNow = new Date(2026, 3, 30); // April 2026

  test("no logs in the window → unit null and weeks remaining null", () => {
    const result = computeItemConsumptionPace([], 100, "mL", 3, fixedNow);
    expect(result.monthly).toHaveLength(3);
    expect(result.averagePerMonth).toBe(0);
    expect(result.unit).toBeNull();
    expect(result.estimatedWeeksRemaining).toBeNull();
  });

  test("computes averagePerMonth from the monthly totals across the window", () => {
    const logs: RawLog[] = [
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-02-10T00:00:00Z" },
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-03-10T00:00:00Z" },
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-04-10T00:00:00Z" },
    ];
    const result = computeItemConsumptionPace(logs, 100, "mL", 3, fixedNow);
    expect(result.unit).toBe("mL");
    expect(result.averagePerMonth).toBe(300);
  });

  test("estimates remaining weeks from current stock and weekly pace", () => {
    const logs: RawLog[] = [
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-02-10T00:00:00Z" },
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-03-10T00:00:00Z" },
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-04-10T00:00:00Z" },
    ];
    // averagePerMonth=300 → averagePerWeek=70 → 100/70 ≈ 1.4 weeks (rounded to 1 decimal)
    const result = computeItemConsumptionPace(logs, 100, "mL", 3, fixedNow);
    expect(result.estimatedWeeksRemaining).toBe(1.4);
  });

  test("currentStock=0 with a positive pace → estimatedWeeksRemaining=0 (not null)", () => {
    const logs: RawLog[] = [
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-04-10T00:00:00Z" },
    ];
    const result = computeItemConsumptionPace(logs, 0, "mL", 3, fixedNow);
    expect(result.estimatedWeeksRemaining).toBe(0);
  });

  test("negative currentStock (over-consumed edge case) is treated like zero stock", () => {
    const logs: RawLog[] = [
      { delta_amount: 300, delta_unit: "mL", occurred_at: "2026-04-10T00:00:00Z" },
    ];
    const result = computeItemConsumptionPace(logs, -5, "mL", 3, fixedNow);
    expect(result.estimatedWeeksRemaining).toBe(0);
  });

  test("averagePerMonth of 0 (only zero-amount logs) → weeks remaining null, unit still resolved", () => {
    const logs: RawLog[] = [
      { delta_amount: 0, delta_unit: "個", occurred_at: "2026-04-10T00:00:00Z" },
    ];
    const result = computeItemConsumptionPace(logs, 100, "個", 3, fixedNow);
    expect(result.unit).toBe("個");
    expect(result.averagePerMonth).toBe(0);
    expect(result.estimatedWeeksRemaining).toBeNull();
  });

  test("mixed units in the window → uses only the item's current unit", () => {
    const logs: RawLog[] = [
      { delta_amount: 50, delta_unit: "g", occurred_at: "2026-04-01T00:00:00Z" },
      { delta_amount: 900, delta_unit: "mL", occurred_at: "2026-04-15T00:00:00Z" },
    ];
    const result = computeItemConsumptionPace(logs, 100, "g", 3, fixedNow);
    expect(result.unit).toBe("g");
    expect(result.averagePerMonth).toBeCloseTo(50 / 3, 5);
  });

  test("respects a custom months window", () => {
    const logs: RawLog[] = [
      { delta_amount: 100, delta_unit: "個", occurred_at: "2026-04-10T00:00:00Z" },
    ];
    const result = computeItemConsumptionPace(logs, 10, "個", 1, fixedNow);
    expect(result.monthly).toHaveLength(1);
    expect(result.averagePerMonth).toBe(100);
  });
});
