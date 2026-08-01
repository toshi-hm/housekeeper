import { afterEach, beforeEach, describe, expect, test } from "bun:test";

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
  describe("under a negative UTC offset timezone", () => {
    const originalTz = process.env.TZ;

    beforeEach(() => {
      // Fixed UTC-8 offset, no DST, for a deterministic repro.
      process.env.TZ = "Etc/GMT+8";
    });

    afterEach(() => {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

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
  });
});
