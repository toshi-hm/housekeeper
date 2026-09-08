import assert from "node:assert/strict";
import { computeNextWasteStreak, shouldEvaluateWasteWeek } from "./streak.ts";

Deno.test("computeNextWasteStreak - increments current streak on a zero-waste week", () => {
  const next = computeNextWasteStreak({ current_streak_weeks: 2, longest_streak_weeks: 5 }, 0);
  assert.deepStrictEqual(next, { current_streak_weeks: 3, longest_streak_weeks: 5 });
});

Deno.test("computeNextWasteStreak - resets current streak to 0 on any waste this week", () => {
  const next = computeNextWasteStreak({ current_streak_weeks: 4, longest_streak_weeks: 4 }, 3);
  assert.deepStrictEqual(next, { current_streak_weeks: 0, longest_streak_weeks: 4 });
});

Deno.test("computeNextWasteStreak - updates the personal-best when the new streak exceeds it", () => {
  const next = computeNextWasteStreak({ current_streak_weeks: 5, longest_streak_weeks: 5 }, 0);
  assert.deepStrictEqual(next, { current_streak_weeks: 6, longest_streak_weeks: 6 });
});

Deno.test("computeNextWasteStreak - keeps the personal-best after a reset", () => {
  const next = computeNextWasteStreak({ current_streak_weeks: 10, longest_streak_weeks: 10 }, 1);
  assert.deepStrictEqual(next, { current_streak_weeks: 0, longest_streak_weeks: 10 });
});

Deno.test("computeNextWasteStreak - starts a fresh streak from all-zero state", () => {
  const next = computeNextWasteStreak({ current_streak_weeks: 0, longest_streak_weeks: 0 }, 0);
  assert.deepStrictEqual(next, { current_streak_weeks: 1, longest_streak_weeks: 1 });
});

Deno.test("shouldEvaluateWasteWeek - true when never evaluated (null)", () => {
  assert.strictEqual(shouldEvaluateWasteWeek(null, "2026-09-07"), true);
});

Deno.test("shouldEvaluateWasteWeek - false when this exact week was already evaluated", () => {
  assert.strictEqual(shouldEvaluateWasteWeek("2026-09-07", "2026-09-07"), false);
});

Deno.test("shouldEvaluateWasteWeek - true when the last evaluated week is a different (older) week", () => {
  assert.strictEqual(shouldEvaluateWasteWeek("2026-08-31", "2026-09-07"), true);
});
