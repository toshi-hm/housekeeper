import assert from "node:assert/strict";
import { zonedDateString, zonedNow } from "./date.ts";

const withFixedNow = <T>(isoUtc: string, run: () => T): T => {
  const originalNow = Date.now;
  Date.now = () => new Date(isoUtc).getTime();
  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
};

// zonedDateString

Deno.test("zonedDateString - UTC 23:00 (JST 08:00 same day) returns the JST calendar day", () => {
  const result = withFixedNow("2026-07-13T23:00:00.000Z", () => zonedDateString("Asia/Tokyo"));
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("zonedDateString - UTC 15:00 (JST 00:00 next day) rolls over to the next JST day, not the UTC day", () => {
  // This is the boundary from #520: at UTC 15:00 the JST calendar day has
  // already advanced, but a naive `new Date().toISOString()` would still
  // report the earlier UTC day.
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => zonedDateString("Asia/Tokyo"));
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("zonedDateString - UTC 14:59 (JST 23:59 same day) stays on the earlier JST day", () => {
  const result = withFixedNow("2026-07-13T14:59:00.000Z", () => zonedDateString("Asia/Tokyo"));
  assert.strictEqual(result, "2026-07-13");
});

Deno.test("zonedDateString - applies a positive offset in days", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => zonedDateString("Asia/Tokyo", 3));
  assert.strictEqual(result, "2026-07-17");
});

Deno.test("zonedDateString - applies a negative offset in days", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => zonedDateString("Asia/Tokyo", -1));
  assert.strictEqual(result, "2026-07-13");
});

Deno.test("zonedDateString (#660) - a different timezone (America/Los_Angeles, UTC-7 in July) sees an earlier calendar day", () => {
  // At UTC 04:00, JST (UTC+9) is already 13:00 the same day, but Los Angeles
  // (UTC-7 in July, PDT) is still 21:00 the previous day.
  const result = withFixedNow("2026-07-14T04:00:00.000Z", () =>
    zonedDateString("America/Los_Angeles"),
  );
  assert.strictEqual(result, "2026-07-13");
});

Deno.test("zonedDateString (#660) - falls back to Asia/Tokyo for an invalid timezone string", () => {
  const tokyo = withFixedNow("2026-07-13T23:00:00.000Z", () => zonedDateString("Asia/Tokyo"));
  const invalid = withFixedNow("2026-07-13T23:00:00.000Z", () =>
    zonedDateString("Not/A_Real_Zone"),
  );
  assert.strictEqual(invalid, tokyo);
});

// zonedNow

Deno.test("zonedNow - reports the JST hour and date consistently at the UTC day boundary", () => {
  const result = withFixedNow("2026-07-13T15:30:00.000Z", () => zonedNow("Asia/Tokyo"));
  assert.strictEqual(result.date, "2026-07-14");
  assert.strictEqual(result.hour, 0);
});

Deno.test("zonedNow (#660) - a different timezone reports its own local hour, not JST's", () => {
  // UTC 15:30 is JST 00:30 (next day) but America/Los_Angeles (UTC-7, PDT)
  // is 08:30 the same day.
  const result = withFixedNow("2026-07-13T15:30:00.000Z", () => zonedNow("America/Los_Angeles"));
  assert.strictEqual(result.date, "2026-07-13");
  assert.strictEqual(result.hour, 8);
});
