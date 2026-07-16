import assert from "node:assert/strict";
import { jstDateString, jstNow } from "./date.ts";

const withFixedNow = <T>(isoUtc: string, run: () => T): T => {
  const originalNow = Date.now;
  Date.now = () => new Date(isoUtc).getTime();
  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
};

// jstDateString

Deno.test("jstDateString - UTC 23:00 (JST 08:00 same day) returns the UTC calendar day", () => {
  const result = withFixedNow("2026-07-13T23:00:00.000Z", () => jstDateString());
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("jstDateString - UTC 15:00 (JST 00:00 next day) rolls over to the next JST day, not the UTC day", () => {
  // This is the boundary from #520: at UTC 15:00 the JST calendar day has
  // already advanced, but a naive `new Date().toISOString()` would still
  // report the earlier UTC day.
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => jstDateString());
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("jstDateString - UTC 14:59 (JST 23:59 same day) stays on the earlier JST day", () => {
  const result = withFixedNow("2026-07-13T14:59:00.000Z", () => jstDateString());
  assert.strictEqual(result, "2026-07-13");
});

Deno.test("jstDateString - applies a positive offset in JST days", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => jstDateString(3));
  assert.strictEqual(result, "2026-07-17");
});

Deno.test("jstDateString - applies a negative offset in JST days", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => jstDateString(-1));
  assert.strictEqual(result, "2026-07-13");
});

// jstNow

Deno.test("jstNow - reports the JST hour and date consistently at the UTC day boundary", () => {
  const result = withFixedNow("2026-07-13T15:30:00.000Z", () => jstNow());
  assert.strictEqual(result.date, "2026-07-14");
  assert.strictEqual(result.hour, 0);
});
