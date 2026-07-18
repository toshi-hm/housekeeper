import { describe, expect, test } from "bun:test";

import {
  computeCategoryStats,
  computeExpiryDistribution,
  computeMonthlyConsumption,
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
