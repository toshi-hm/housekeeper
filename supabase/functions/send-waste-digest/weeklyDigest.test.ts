import assert from "node:assert/strict";
import { computeWeeklyWasteDigest, targetWeekStartDateString } from "./weeklyDigest.ts";

// Monday. Mirrors src/types/stats.test.ts's computeWeeklyWasteDigest coverage
// (kept lighter here — see that file for the exhaustive cases; this only
// guards against the two implementations drifting apart).
const now = new Date("2026-09-07T08:00:00Z");

Deno.test("computeWeeklyWasteDigest - zero/empty result when there are no waste logs", () => {
  const result = computeWeeklyWasteDigest([], now);
  assert.deepStrictEqual(result, {
    currentWeekCount: 0,
    previousWeekCount: 0,
    changePercent: null,
    topWasted: [],
  });
});

Deno.test("computeWeeklyWasteDigest - computes week-over-week percentage and top-3 ranking", () => {
  const items = [
    { name: "卵", deleted_at: "2026-09-01T00:00:00Z" },
    { name: "卵", deleted_at: "2026-09-02T00:00:00Z" },
    { name: "牛乳", deleted_at: "2026-09-03T00:00:00Z" },
    { name: "卵", deleted_at: "2026-08-25T00:00:00Z" },
  ];
  const result = computeWeeklyWasteDigest(items, now);
  assert.strictEqual(result.currentWeekCount, 3);
  assert.strictEqual(result.previousWeekCount, 1);
  assert.strictEqual(result.changePercent, 200);
  assert.deepStrictEqual(result.topWasted, [
    { name: "卵", count: 2 },
    { name: "牛乳", count: 1 },
  ]);
});

Deno.test("computeWeeklyWasteDigest - a no-waste target week returns 0 with a defined comparison", () => {
  const items = [
    { name: "卵", deleted_at: "2026-08-25T00:00:00Z" },
    { name: "牛乳", deleted_at: "2026-08-26T00:00:00Z" },
  ];
  const result = computeWeeklyWasteDigest(items, now);
  assert.strictEqual(result.currentWeekCount, 0);
  assert.strictEqual(result.previousWeekCount, 2);
  assert.strictEqual(result.changePercent, -100);
  assert.deepStrictEqual(result.topWasted, []);
});

Deno.test("targetWeekStartDateString - resolves the Monday that starts the completed target week", () => {
  assert.strictEqual(targetWeekStartDateString(now), "2026-08-31");
});

Deno.test("targetWeekStartDateString - is stable across any day within the same current week", () => {
  const midweek = new Date("2026-09-10T23:00:00Z"); // Thursday, same week as `now`
  assert.strictEqual(targetWeekStartDateString(midweek), "2026-08-31");
});
