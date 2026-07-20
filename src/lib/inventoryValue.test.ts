import { describe, expect, test } from "bun:test";

import { computeInventoryValue } from "./inventoryValue";

describe("computeInventoryValue", () => {
  test("returns null for empty lots", () => {
    expect(computeInventoryValue([], 100)).toBeNull();
  });

  test("returns null when all lots have unit_price = null (未設定)", () => {
    const result = computeInventoryValue(
      [
        { units: 3, unit_price: null },
        { units: 1, unit_price: null },
      ],
      100,
    );
    expect(result).toBeNull();
  });

  test("returns null when unit_price is undefined", () => {
    const result = computeInventoryValue([{ units: 2, unit_price: undefined }], 100);
    expect(result).toBeNull();
  });

  test("single lot: units × unit_price", () => {
    const result = computeInventoryValue([{ units: 3, unit_price: 150 }], 100);
    expect(result).toEqual({ totalValue: 450, pricedUnits: 3, averageUnitPrice: 150 });
  });

  test("sums across multiple priced lots", () => {
    const result = computeInventoryValue(
      [
        { units: 2, unit_price: 100 },
        { units: 1, unit_price: 300 },
      ],
      100,
    );
    expect(result).toEqual({
      totalValue: 500,
      pricedUnits: 3,
      averageUnitPrice: Math.round(500 / 3),
    });
  });

  test("excludes unpriced lots but still counts priced ones (partial pricing)", () => {
    const result = computeInventoryValue(
      [
        { units: 2, unit_price: 100 },
        { units: 5, unit_price: null },
      ],
      100,
    );
    expect(result).toEqual({ totalValue: 200, pricedUnits: 2, averageUnitPrice: 100 });
  });

  test("excludes lots with units <= 0 even if priced (used-up lot)", () => {
    const result = computeInventoryValue(
      [
        { units: 0, unit_price: 100 },
        { units: 2, unit_price: 50 },
      ],
      100,
    );
    expect(result).toEqual({ totalValue: 100, pricedUnits: 2, averageUnitPrice: 50 });
  });

  test("unit_price = 0 is treated as a valid, priced value (free item)", () => {
    const result = computeInventoryValue([{ units: 4, unit_price: 0 }], 100);
    expect(result).toEqual({ totalValue: 0, pricedUnits: 4, averageUnitPrice: 0 });
  });

  test("rounds averageUnitPrice to nearest yen", () => {
    const result = computeInventoryValue(
      [
        { units: 3, unit_price: 100 },
        { units: 1, unit_price: 101 },
      ],
      100,
    );
    // total = 401, units = 4 → 100.25 → rounds to 100
    expect(result?.averageUnitPrice).toBe(100);
  });

  test("prorates an opened package by its remaining content", () => {
    const result = computeInventoryValue(
      [{ units: 2, opened_remaining: 25, unit_price: 200 }],
      100,
    );
    expect(result).toEqual({ totalValue: 250, pricedUnits: 1.25, averageUnitPrice: 200 });
  });
});
