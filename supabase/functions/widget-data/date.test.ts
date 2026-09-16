import assert from "node:assert/strict";
import { zonedTodayString } from "./date.ts";

const withFixedNow = <T>(isoUtc: string, run: () => T): T => {
  const originalNow = Date.now;
  Date.now = () => new Date(isoUtc).getTime();
  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
};

Deno.test("zonedTodayString - UTC 15:00 (JST 00:00 next day) rolls over to the next JST day", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => zonedTodayString("Asia/Tokyo"));
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("zonedTodayString - UTC 14:59 (JST 23:59 same day) stays on the earlier JST day", () => {
  const result = withFixedNow("2026-07-13T14:59:00.000Z", () => zonedTodayString("Asia/Tokyo"));
  assert.strictEqual(result, "2026-07-13");
});

Deno.test("zonedTodayString (#1072) - null timezone falls back to Asia/Tokyo", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => zonedTodayString(null));
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("zonedTodayString (#1072) - undefined timezone falls back to Asia/Tokyo", () => {
  const result = withFixedNow("2026-07-13T15:00:00.000Z", () => zonedTodayString(undefined));
  assert.strictEqual(result, "2026-07-14");
});

Deno.test("zonedTodayString (#1072) - falls back to Asia/Tokyo for an invalid timezone string", () => {
  const tokyo = withFixedNow("2026-07-13T23:00:00.000Z", () => zonedTodayString("Asia/Tokyo"));
  const invalid = withFixedNow("2026-07-13T23:00:00.000Z", () =>
    zonedTodayString("Not/A_Real_Zone"),
  );
  assert.strictEqual(invalid, tokyo);
});

Deno.test("zonedTodayString (#1072) - a different timezone sees an earlier calendar day than JST", () => {
  // At UTC 04:00, JST (UTC+9) is already 13:00 the same day, but Los Angeles
  // (UTC-7 in July, PDT) is still 21:00 the previous day.
  const result = withFixedNow("2026-07-14T04:00:00.000Z", () =>
    zonedTodayString("America/Los_Angeles"),
  );
  assert.strictEqual(result, "2026-07-13");
});
