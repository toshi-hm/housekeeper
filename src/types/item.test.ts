import { describe, expect, test } from "bun:test";

import {
  computeConsumption,
  DEFAULT_EXPIRY_WARNING_DAYS,
  formatRemaining,
  getExpiryStatus,
  itemLotSchema,
} from "./item";

// --- itemLotSchema ---

describe("itemLotSchema", () => {
  // Zod v4 requires version nibble [1-8] and variant nibble [89abAB]
  const validLot = {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    item_id: "00000000-0000-4000-8000-000000000003",
    units: 2,
    opened_remaining: null,
    purchase_date: null,
    expiry_date: "2099-12-31",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  test("valid lot parses correctly", () => {
    const result = itemLotSchema.safeParse(validLot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units).toBe(2);
      expect(result.data.opened_remaining).toBeNull();
    }
  });

  test("units=0 is allowed", () => {
    const result = itemLotSchema.safeParse({ ...validLot, units: 0 });
    expect(result.success).toBe(true);
  });

  test("negative units fail", () => {
    const result = itemLotSchema.safeParse({ ...validLot, units: -1 });
    expect(result.success).toBe(false);
  });

  test("opened_remaining as number is valid", () => {
    const result = itemLotSchema.safeParse({ ...validLot, opened_remaining: 350 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.opened_remaining).toBe(350);
  });

  test("negative opened_remaining fails", () => {
    const result = itemLotSchema.safeParse({ ...validLot, opened_remaining: -1 });
    expect(result.success).toBe(false);
  });

  test("missing required fields fail", () => {
    const withoutId: Record<string, unknown> = { ...validLot };
    delete withoutId["id"];
    const result = itemLotSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });
});

// --- formatRemaining ---

describe("formatRemaining", () => {
  test("all sealed: units × content_amount", () => {
    expect(formatRemaining(3, 1000, null)).toBe("3000");
  });

  test("one opened unit: (units-1) × amount + opened_remaining", () => {
    expect(formatRemaining(3, 1000, 350)).toBe("2350");
  });

  test("single unit fully sealed", () => {
    expect(formatRemaining(1, 500, null)).toBe("500");
  });

  test("single unit opened", () => {
    expect(formatRemaining(1, 500, 200)).toBe("200");
  });

  test("count unit (個) with content_amount=1", () => {
    expect(formatRemaining(5, 1, null)).toBe("5");
  });

  test("decimal content_amount strips trailing zeros", () => {
    // 2 × 1.5 = 3.0 → "3"
    expect(formatRemaining(2, 1.5, null)).toBe("3");
  });

  test("decimal result keeps significant digits", () => {
    // 1 × 1.5 opened=0.75 → (0 × 1.5) + 0.75 = 0.75
    expect(formatRemaining(1, 1.5, 0.75)).toBe("0.75");
  });
});

// --- getExpiryStatus ---

describe("getExpiryStatus", () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0] as string;
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  test("null => unknown", () => {
    expect(getExpiryStatus(null)).toBe("unknown");
    expect(getExpiryStatus(undefined)).toBe("unknown");
  });

  test("past date => expired", () => {
    expect(getExpiryStatus(fmt(addDays(-1)))).toBe("expired");
    expect(getExpiryStatus("2000-01-01")).toBe("expired");
  });

  test("today => expiring-soon (within warning days)", () => {
    expect(getExpiryStatus(fmt(today))).toBe("expiring-soon");
  });

  test("within warning days => expiring-soon", () => {
    expect(getExpiryStatus(fmt(addDays(DEFAULT_EXPIRY_WARNING_DAYS)))).toBe("expiring-soon");
    expect(getExpiryStatus(fmt(addDays(1)))).toBe("expiring-soon");
  });

  test("beyond warning days => ok", () => {
    expect(getExpiryStatus(fmt(addDays(DEFAULT_EXPIRY_WARNING_DAYS + 1)))).toBe("ok");
    expect(getExpiryStatus("2099-12-31")).toBe("ok");
  });

  test("custom warningDays", () => {
    expect(getExpiryStatus(fmt(addDays(5)), 7)).toBe("expiring-soon");
    expect(getExpiryStatus(fmt(addDays(8)), 7)).toBe("ok");
  });
});

// --- computeConsumption ---

describe("computeConsumption", () => {
  const baseItem = {
    units: 3,
    content_amount: 500,
    content_unit: "mL",
    opened_remaining: null,
  };

  test("unopened: consume less than one unit", () => {
    const r = computeConsumption(baseItem, 200);
    expect(r.units_after).toBe(3);
    expect(r.opened_remaining_after).toBe(300);
    expect(r.error).toBeUndefined();
  });

  test("unopened: consume exactly one unit", () => {
    const r = computeConsumption(baseItem, 500);
    expect(r.units_after).toBe(2);
    expect(r.opened_remaining_after).toBeNull();
  });

  test("opened: consume less than remaining", () => {
    const r = computeConsumption({ ...baseItem, opened_remaining: 300 }, 100);
    expect(r.units_after).toBe(3);
    expect(r.opened_remaining_after).toBe(200);
  });

  test("opened: consume across unit boundary", () => {
    const r = computeConsumption({ ...baseItem, opened_remaining: 100 }, 200);
    expect(r.units_after).toBe(2);
    expect(r.opened_remaining_after).toBe(400);
  });

  test("consume more than total stock => error", () => {
    const r = computeConsumption({ ...baseItem, units: 1, opened_remaining: 200 }, 800);
    expect(r.error).toBeDefined();
  });

  test("units=0 consume => error", () => {
    const r = computeConsumption({ ...baseItem, units: 0, opened_remaining: 0 }, 1);
    expect(r.error).toBeDefined();
  });

  test("consume exact total (single unit, full)", () => {
    const r = computeConsumption({ ...baseItem, units: 1, opened_remaining: null }, 500);
    expect(r.units_after).toBe(0);
    expect(r.opened_remaining_after).toBeNull();
  });

  test("consuming across multiple units with remainder=0", () => {
    // units=5, opened=100, consume 1100: 100 + 500 + 500 = 1100, uses 3 slots
    const r = computeConsumption({ ...baseItem, units: 5, opened_remaining: 100 }, 1100);
    expect(r.units_after).toBe(2);
    expect(r.opened_remaining_after).toBeNull();
    expect(r.error).toBeUndefined();
  });

  test("opened: consume more than opened with no sealed units left => error", () => {
    // units=1 (the open unit), opened=200, delta=300: only 200 available, not 800
    const r = computeConsumption({ ...baseItem, units: 1, opened_remaining: 200 }, 300);
    expect(r.error).toBeDefined();
  });
});
