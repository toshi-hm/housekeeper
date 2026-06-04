import assert from "node:assert/strict";
import { formatExpiryDate, formatTotalRemaining } from "./inventory-formatters.ts";

// formatTotalRemaining

Deno.test("formatTotalRemaining - zero units, no opened_remaining", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 0,
      content_amount: 500,
      content_unit: "ml",
      opened_remaining: null,
    }),
    "0ml",
  );
});

Deno.test("formatTotalRemaining - single sealed unit", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 1,
      content_amount: 500,
      content_unit: "ml",
      opened_remaining: null,
    }),
    "500ml",
  );
});

Deno.test("formatTotalRemaining - multiple sealed units", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 3,
      content_amount: 500,
      content_unit: "ml",
      opened_remaining: null,
    }),
    "1500ml",
  );
});

Deno.test("formatTotalRemaining - sealed units + opened_remaining", () => {
  // 2 units total: 1 opened (250ml left) + 1 sealed (500ml)
  assert.strictEqual(
    formatTotalRemaining({
      units: 2,
      content_amount: 500,
      content_unit: "ml",
      opened_remaining: 250,
    }),
    "750ml",
  );
});

Deno.test("formatTotalRemaining - only opened unit (units=1, opened_remaining set)", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 1,
      content_amount: 500,
      content_unit: "ml",
      opened_remaining: 300,
    }),
    "300ml",
  );
});

Deno.test("formatTotalRemaining - opened unit with zero remaining", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 1,
      content_amount: 500,
      content_unit: "ml",
      opened_remaining: 0,
    }),
    "0ml",
  );
});

Deno.test("formatTotalRemaining - decimal result rounded to 2 places", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 1,
      content_amount: 100,
      content_unit: "g",
      opened_remaining: 33.333,
    }),
    "33.33g",
  );
});

Deno.test("formatTotalRemaining - integer total does not show decimal", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 2,
      content_amount: 100,
      content_unit: "g",
      opened_remaining: 50,
    }),
    "150g",
  );
});

Deno.test("formatTotalRemaining - different unit label (個)", () => {
  assert.strictEqual(
    formatTotalRemaining({
      units: 5,
      content_amount: 1,
      content_unit: "個",
      opened_remaining: null,
    }),
    "5個",
  );
});

// formatExpiryDate

Deno.test("formatExpiryDate - null returns 未設定", () => {
  assert.strictEqual(formatExpiryDate(null), "未設定");
});

Deno.test("formatExpiryDate - valid date string", () => {
  assert.strictEqual(formatExpiryDate("2026-03-15"), "3月15日");
});

Deno.test("formatExpiryDate - leading zeros stripped", () => {
  assert.strictEqual(formatExpiryDate("2026-01-05"), "1月5日");
});

Deno.test("formatExpiryDate - incomplete string (no dashes) returned as-is", () => {
  assert.strictEqual(formatExpiryDate("20260315"), "20260315");
});
