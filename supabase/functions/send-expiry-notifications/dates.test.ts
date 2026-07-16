import assert from "node:assert/strict";
import { addDaysToDateStr, jstNow } from "./dates.ts";

Deno.test("addDaysToDateStr - adds days within the same month", () => {
  assert.strictEqual(addDaysToDateStr("2026-07-10", 3), "2026-07-13");
});

Deno.test("addDaysToDateStr - crosses a month boundary", () => {
  assert.strictEqual(addDaysToDateStr("2026-07-30", 3), "2026-08-02");
});

Deno.test("addDaysToDateStr - crosses a year boundary", () => {
  assert.strictEqual(addDaysToDateStr("2026-12-30", 3), "2027-01-02");
});

Deno.test("addDaysToDateStr - zero days returns the same date", () => {
  assert.strictEqual(addDaysToDateStr("2026-07-16", 0), "2026-07-16");
});

Deno.test("addDaysToDateStr - handles leap day", () => {
  assert.strictEqual(addDaysToDateStr("2028-02-28", 1), "2028-02-29");
});

Deno.test("jstNow - returns a date matching YYYY-MM-DD and hour within 0-23", () => {
  const { date, hour } = jstNow();
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(hour >= 0 && hour <= 23);
});

Deno.test("jstNow - is 9 hours ahead of the UTC calendar day near UTC midnight", () => {
  // UTC 2026-07-15T20:00:00Z -> JST 2026-07-16T05:00:00+09:00
  const fixedUtc = new Date("2026-07-15T20:00:00.000Z").getTime();
  const realNow = Date.now;
  try {
    Date.now = () => fixedUtc;
    const { date, hour } = jstNow();
    assert.strictEqual(date, "2026-07-16");
    assert.strictEqual(hour, 5);
  } finally {
    Date.now = realNow;
  }
});
