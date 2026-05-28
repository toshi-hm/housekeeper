import { assertEquals } from "jsr:@std/assert";
import { formatExpiryDate, formatTotalRemaining } from "./inventory-formatters.ts";

// formatTotalRemaining

Deno.test("formatTotalRemaining - zero units, no opened_remaining", () => {
  assertEquals(formatTotalRemaining({ units: 0, content_amount: 500, content_unit: "ml", opened_remaining: null }), "0ml");
});

Deno.test("formatTotalRemaining - single sealed unit", () => {
  assertEquals(formatTotalRemaining({ units: 1, content_amount: 500, content_unit: "ml", opened_remaining: null }), "500ml");
});

Deno.test("formatTotalRemaining - multiple sealed units", () => {
  assertEquals(formatTotalRemaining({ units: 3, content_amount: 500, content_unit: "ml", opened_remaining: null }), "1500ml");
});

Deno.test("formatTotalRemaining - sealed units + opened_remaining", () => {
  // 2 units total: 1 opened (250ml left) + 1 sealed (500ml)
  assertEquals(formatTotalRemaining({ units: 2, content_amount: 500, content_unit: "ml", opened_remaining: 250 }), "750ml");
});

Deno.test("formatTotalRemaining - only opened unit (units=1, opened_remaining set)", () => {
  assertEquals(formatTotalRemaining({ units: 1, content_amount: 500, content_unit: "ml", opened_remaining: 300 }), "300ml");
});

Deno.test("formatTotalRemaining - opened unit with zero remaining", () => {
  assertEquals(formatTotalRemaining({ units: 1, content_amount: 500, content_unit: "ml", opened_remaining: 0 }), "0ml");
});

Deno.test("formatTotalRemaining - decimal result is rounded to 2 places", () => {
  // 1 sealed (333ml) + opened 100ml => total 433ml (integer), but content_amount=333.333...
  // Use a value that produces a real decimal
  assertEquals(
    formatTotalRemaining({ units: 1, content_amount: 100, content_unit: "g", opened_remaining: 33.333 }),
    "33.33g",
  );
});

Deno.test("formatTotalRemaining - integer total does not show decimal", () => {
  assertEquals(formatTotalRemaining({ units: 2, content_amount: 100, content_unit: "g", opened_remaining: 50 }), "150g");
});

Deno.test("formatTotalRemaining - different unit label (個)", () => {
  assertEquals(formatTotalRemaining({ units: 5, content_amount: 1, content_unit: "個", opened_remaining: null }), "5個");
});

// formatExpiryDate

Deno.test("formatExpiryDate - null returns 未設定", () => {
  assertEquals(formatExpiryDate(null), "未設定");
});

Deno.test("formatExpiryDate - valid date string", () => {
  assertEquals(formatExpiryDate("2026-03-15"), "3月15日");
});

Deno.test("formatExpiryDate - leading zeros stripped", () => {
  assertEquals(formatExpiryDate("2026-01-05"), "1月5日");
});

Deno.test("formatExpiryDate - incomplete string (no dashes) returned as-is", () => {
  assertEquals(formatExpiryDate("20260315"), "20260315");
});
