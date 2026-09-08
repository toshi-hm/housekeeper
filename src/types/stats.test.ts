import { describe, expect, test } from "bun:test";

import {
  computeBudgetStatus,
  computeMonthlySpending,
  computeWeeklyWasteDigest,
  type RawWasteDigestItem,
  type SpendingLotRow,
} from "./stats";

// --- computeMonthlySpending (#633, timezone regression #710) ---

describe("computeMonthlySpending", () => {
  const lot = (
    unit_price: number | null,
    purchased_units: number,
    purchase_date: string | null,
  ): SpendingLotRow => ({
    unit_price,
    purchased_units,
    purchase_date,
  });

  test("aggregates unit_price * purchased_units per month, most recent last", () => {
    const now = new Date(2026, 7, 15); // 2026-08-15 (local)
    const lots: SpendingLotRow[] = [
      lot(100, 2, "2026-07-01"), // July: 200
      lot(150, 1, "2026-07-15"), // July: +150 = 350
      lot(300, 1, "2026-08-01"), // August: 300
    ];

    const result = computeMonthlySpending(lots, 2, now);

    expect(result).toEqual([
      { month: "2026/07", total: 350 },
      { month: "2026/08", total: 300 },
    ]);
  });

  test("excludes lots with null unit_price or missing purchase_date", () => {
    const now = new Date(2026, 7, 15);
    const lots: SpendingLotRow[] = [
      lot(null, 2, "2026-08-01"),
      lot(100, 1, null),
      lot(200, 1, "2026-08-10"),
    ];

    const result = computeMonthlySpending(lots, 1, now);

    expect(result).toEqual([{ month: "2026/08", total: 200 }]);
  });

  test("a purchase on the first of the month is counted in that month (UTC)", () => {
    const now = new Date(2026, 7, 15);
    const lots: SpendingLotRow[] = [lot(500, 1, "2026-08-01")];

    const result = computeMonthlySpending(lots, 1, now);

    expect(result).toEqual([{ month: "2026/08", total: 500 }]);
  });

  // Regression test for #710: `purchase_date` is a DB `date` column
  // (e.g. "2026-08-01"). Parsing it with `new Date("2026-08-01")` treats the
  // string as UTC midnight; reading it back with getFullYear()/getMonth()
  // then uses the *local* timezone. In any timezone west of UTC (negative
  // offset), that shifts the date back by a day, so a purchase made on the
  // 1st of the month gets counted in the previous month instead.
  //
  // Note: this used to be reproduced by mutating `process.env.TZ` at test
  // time, but Bun/JavaScriptCore caches the resolved timezone for the whole
  // process on first use — restoring the env var afterwards does not undo
  // it, which permanently skews every other test file's Date behavior for
  // the rest of the `bun test` run. Instead, the UTC-midnight round-trip is
  // reproduced with explicit UTC arithmetic below, independent of host TZ.
  test("a purchase on the 1st of the month is still counted in that month, not the previous one", () => {
    const now = new Date(2026, 7, 15); // 2026-08-15 local
    const lots: SpendingLotRow[] = [lot(1200, 1, "2026-08-01")];

    const result = computeMonthlySpending(lots, 2, now);

    expect(result).toEqual([
      { month: "2026/07", total: 0 },
      { month: "2026/08", total: 1200 },
    ]);
  });

  test("purchases spread across a month boundary land in their correct months", () => {
    const now = new Date(2026, 7, 15);
    const lots: SpendingLotRow[] = [
      lot(1000, 1, "2026-07-31"), // last day of July
      lot(2000, 1, "2026-08-01"), // first day of August
    ];

    const result = computeMonthlySpending(lots, 2, now);

    expect(result).toEqual([
      { month: "2026/07", total: 1000 },
      { month: "2026/08", total: 2000 },
    ]);
  });

  test("naive `new Date(str)` parsing would roll a date back a day under a negative UTC offset, unlike the fixed component-based parsing", () => {
    // What the old buggy code did: parse the date-only string directly, which
    // JS interprets as UTC midnight.
    const buggyParsed = new Date("2026-08-01");
    // Simulate reading that UTC-midnight instant back at a fixed UTC-8 offset
    // (without touching the real process timezone): subtracting 8 hours and
    // reading UTC components approximates what local getters would show.
    const asIfReadAtUtcMinus8 = new Date(buggyParsed.getTime() - 8 * 60 * 60 * 1000);
    expect(asIfReadAtUtcMinus8.getUTCDate()).toBe(31); // rolled back to July 31st — the bug.

    // The fixed implementation instead splits the date-only string into
    // components and builds a *local* date directly, never round-tripping
    // through a UTC instant, so it can't roll back a day on any host TZ.
    const [y, m, d] = "2026-08-01".split("-").map(Number);
    const fixed = new Date(y, m - 1, d);
    expect(fixed.getFullYear()).toBe(2026);
    expect(fixed.getMonth()).toBe(7);
    expect(fixed.getDate()).toBe(1);
  });
});

// --- computeWeeklyWasteDigest (#925) ---

describe("computeWeeklyWasteDigest", () => {
  // Monday. Current (target) week = 2026-08-31 〜 2026-09-06, previous week =
  // 2026-08-24 〜 2026-08-30 (see utcWeekStart's UTC/Monday-start semantics).
  const now = new Date("2026-09-07T08:00:00Z");

  const wasteItem = (name: string, deletedAt: string): RawWasteDigestItem => ({
    name,
    deleted_at: deletedAt,
  });

  test("returns a zero/empty result when there are no waste logs at all", () => {
    const result = computeWeeklyWasteDigest([], now);
    expect(result).toEqual({
      currentWeekCount: 0,
      previousWeekCount: 0,
      changePercent: null,
      topWasted: [],
    });
  });

  test("counts a single week of data with no prior week as an unknown (null) comparison", () => {
    const items: RawWasteDigestItem[] = [
      wasteItem("卵", "2026-09-01T10:00:00Z"),
      wasteItem("牛乳", "2026-09-02T10:00:00Z"),
    ];
    const result = computeWeeklyWasteDigest(items, now);
    expect(result.currentWeekCount).toBe(2);
    expect(result.previousWeekCount).toBe(0);
    expect(result.changePercent).toBeNull();
  });

  test("computes the week-over-week percentage comparison", () => {
    const items: RawWasteDigestItem[] = [
      // Current week (2026-08-31〜09-06): 4 items
      wasteItem("卵", "2026-09-01T00:00:00Z"),
      wasteItem("卵", "2026-09-02T00:00:00Z"),
      wasteItem("牛乳", "2026-09-03T00:00:00Z"),
      wasteItem("パン", "2026-09-04T00:00:00Z"),
      // Previous week (2026-08-24〜08-30): 2 items → +100%
      wasteItem("卵", "2026-08-25T00:00:00Z"),
      wasteItem("牛乳", "2026-08-26T00:00:00Z"),
      // Outside both windows — must not be counted either way.
      wasteItem("味噌", "2026-08-10T00:00:00Z"),
    ];
    const result = computeWeeklyWasteDigest(items, now);
    expect(result.currentWeekCount).toBe(4);
    expect(result.previousWeekCount).toBe(2);
    expect(result.changePercent).toBe(100);
  });

  test("computes a negative percentage when this week wasted less than last week", () => {
    const items: RawWasteDigestItem[] = [
      wasteItem("卵", "2026-09-01T00:00:00Z"),
      wasteItem("卵", "2026-08-25T00:00:00Z"),
      wasteItem("牛乳", "2026-08-26T00:00:00Z"),
      wasteItem("パン", "2026-08-27T00:00:00Z"),
    ];
    const result = computeWeeklyWasteDigest(items, now);
    expect(result.currentWeekCount).toBe(1);
    expect(result.previousWeekCount).toBe(3);
    expect(result.changePercent).toBe(-67); // Math.round((1-3)/3 * 100)
  });

  test("ranks the top-3 most-wasted item names in the target week, ties broken alphabetically", () => {
    const items: RawWasteDigestItem[] = [
      wasteItem("卵", "2026-09-01T00:00:00Z"),
      wasteItem("卵", "2026-09-01T00:00:00Z"),
      wasteItem("卵", "2026-09-01T00:00:00Z"),
      wasteItem("牛乳", "2026-09-02T00:00:00Z"),
      wasteItem("牛乳", "2026-09-02T00:00:00Z"),
      // Three-way tie at count=1: パン / にんじん / キャベツ. Only one of them
      // fits in the top-3, so which one is picked must be deterministic
      // (alphabetical, via localeCompare) rather than insertion-order luck.
      wasteItem("パン", "2026-09-03T00:00:00Z"),
      wasteItem("にんじん", "2026-09-03T00:00:00Z"),
      wasteItem("キャベツ", "2026-09-04T00:00:00Z"),
    ];
    const result = computeWeeklyWasteDigest(items, now);
    expect(result.topWasted).toEqual([
      { name: "卵", count: 3 },
      { name: "牛乳", count: 2 },
      { name: "キャベツ", count: 1 },
    ]);
  });

  test("excludes items outside the current-week window from the top-wasted ranking", () => {
    const items: RawWasteDigestItem[] = [
      wasteItem("先週の廃棄", "2026-08-25T00:00:00Z"),
      wasteItem("今週の廃棄", "2026-09-01T00:00:00Z"),
    ];
    const result = computeWeeklyWasteDigest(items, now);
    expect(result.topWasted).toEqual([{ name: "今週の廃棄", count: 1 }]);
  });
});

// --- computeBudgetStatus（月次予算超過アラート #991） ---

describe("computeBudgetStatus", () => {
  test("returns null when monthly_budget is unset (null) — no banner", () => {
    expect(computeBudgetStatus(5000, null)).toBeNull();
  });

  test("returns null when monthly_budget is undefined — no banner", () => {
    expect(computeBudgetStatus(5000, undefined)).toBeNull();
  });

  test("returns null when monthly_budget is 0 — avoids a division-by-zero banner", () => {
    expect(computeBudgetStatus(0, 0)).toBeNull();
    expect(computeBudgetStatus(100, 0)).toBeNull();
  });

  test("0 spend against a set budget is 0% and tier normal", () => {
    expect(computeBudgetStatus(0, 30000)).toEqual({
      monthlyBudget: 30000,
      currentSpend: 0,
      percentUsed: 0,
      tier: "normal",
    });
  });

  test("spend under 80% of budget is tier normal", () => {
    expect(computeBudgetStatus(15000, 30000)).toEqual({
      monthlyBudget: 30000,
      currentSpend: 15000,
      percentUsed: 50,
      tier: "normal",
    });
  });

  test("spend at exactly 80% of budget is tier caution", () => {
    expect(computeBudgetStatus(24000, 30000)).toEqual({
      monthlyBudget: 30000,
      currentSpend: 24000,
      percentUsed: 80,
      tier: "caution",
    });
  });

  test("spend between 80% and 100% of budget is tier caution", () => {
    expect(computeBudgetStatus(27000, 30000)).toEqual({
      monthlyBudget: 30000,
      currentSpend: 27000,
      percentUsed: 90,
      tier: "caution",
    });
  });

  test("spend at exactly 100% of budget is tier over", () => {
    expect(computeBudgetStatus(30000, 30000)).toEqual({
      monthlyBudget: 30000,
      currentSpend: 30000,
      percentUsed: 100,
      tier: "over",
    });
  });

  test("spend over 100% of budget is tier over", () => {
    expect(computeBudgetStatus(45000, 30000)).toEqual({
      monthlyBudget: 30000,
      currentSpend: 45000,
      percentUsed: 150,
      tier: "over",
    });
  });

  test("rounds percentUsed to the nearest whole percent", () => {
    const result = computeBudgetStatus(10000, 30000);
    expect(result?.percentUsed).toBe(33);
  });
});
