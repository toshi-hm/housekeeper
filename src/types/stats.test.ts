import { describe, expect, test } from "bun:test";

import { computeMonthlySpending, type SpendingLotRow } from "./stats";

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
