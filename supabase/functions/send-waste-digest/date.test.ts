import assert from "node:assert/strict";
import { zonedNowHour } from "./date.ts";

Deno.test("zonedNowHour - returns an hour in range 0-23 for a valid IANA timezone", () => {
  const hour = zonedNowHour("Asia/Tokyo");
  assert.ok(hour >= 0 && hour <= 23);
});

Deno.test("zonedNowHour - falls back to Asia/Tokyo for an invalid timezone string", () => {
  const fallback = zonedNowHour("Not/A_Zone");
  const tokyo = zonedNowHour("Asia/Tokyo");
  assert.strictEqual(fallback, tokyo);
});
