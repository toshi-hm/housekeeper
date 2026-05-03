import { describe, expect, test } from "bun:test";

import { computeConsumption, DEFAULT_EXPIRY_WARNING_DAYS, getExpiryStatus } from "./item";

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
});
