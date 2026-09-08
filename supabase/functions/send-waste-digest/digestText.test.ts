import assert from "node:assert/strict";
import { buildWasteDigestMessage, resolveWasteDigestLanguage } from "./digestText.ts";

Deno.test("resolveWasteDigestLanguage - passes through supported languages", () => {
  assert.strictEqual(resolveWasteDigestLanguage("ja"), "ja");
  assert.strictEqual(resolveWasteDigestLanguage("en"), "en");
});

Deno.test("resolveWasteDigestLanguage - falls back to ja for unknown/missing values", () => {
  assert.strictEqual(resolveWasteDigestLanguage(undefined), "ja");
  assert.strictEqual(resolveWasteDigestLanguage("fr"), "ja");
  assert.strictEqual(resolveWasteDigestLanguage(null), "ja");
});

Deno.test("buildWasteDigestMessage (ja) - zero-waste week has a celebratory title and no change line", () => {
  const message = buildWasteDigestMessage("ja", {
    currentWeekCount: 0,
    changePercent: null,
    topWasted: [],
    streakWeeksAfterUpdate: 1,
  });
  assert.strictEqual(message.title, "先週は食品ロスゼロでした！");
  assert.ok(!message.body.includes("前週比"));
  assert.ok(message.body.includes("現在1週連続ロスゼロ中です"));
});

Deno.test("buildWasteDigestMessage (ja) - includes a positive change line and top-wasted items", () => {
  const message = buildWasteDigestMessage("ja", {
    currentWeekCount: 4,
    changePercent: 100,
    topWasted: [
      { name: "卵", count: 2 },
      { name: "牛乳", count: 1 },
    ],
    streakWeeksAfterUpdate: 0,
  });
  assert.strictEqual(message.title, "先週は4件の食材を廃棄しました");
  assert.ok(message.body.includes("前週比+100%"));
  assert.ok(message.body.includes("よく廃棄した食材: 卵、牛乳"));
  // streak is 0 → no streak line at all
  assert.ok(!message.body.includes("連続ロスゼロ"));
});

Deno.test("buildWasteDigestMessage (ja) - a decrease renders with a leading minus, not a double sign", () => {
  const message = buildWasteDigestMessage("ja", {
    currentWeekCount: 1,
    changePercent: -67,
    topWasted: [{ name: "卵", count: 1 }],
    streakWeeksAfterUpdate: 0,
  });
  assert.ok(message.body.includes("前週比-67%"));
  assert.ok(!message.body.includes("+-67"));
});

Deno.test("buildWasteDigestMessage (ja) - no change (0%) uses a plus-minus sign", () => {
  const message = buildWasteDigestMessage("ja", {
    currentWeekCount: 2,
    changePercent: 0,
    topWasted: [{ name: "卵", count: 2 }],
    streakWeeksAfterUpdate: 0,
  });
  assert.ok(message.body.includes("前週比±0%"));
});

Deno.test("buildWasteDigestMessage (ja) - null changePercent (no prior week) omits the comparison line", () => {
  const message = buildWasteDigestMessage("ja", {
    currentWeekCount: 2,
    changePercent: null,
    topWasted: [{ name: "卵", count: 2 }],
    streakWeeksAfterUpdate: 0,
  });
  assert.ok(!message.body.includes("前週比"));
});

Deno.test("buildWasteDigestMessage (en) - mirrors the ja content in English", () => {
  const message = buildWasteDigestMessage("en", {
    currentWeekCount: 0,
    changePercent: null,
    topWasted: [],
    streakWeeksAfterUpdate: 3,
  });
  assert.strictEqual(message.title, "Zero food waste last week!");
  assert.ok(message.body.includes("You're on a 3-week zero-waste streak"));
  assert.ok(message.emailBody.includes("Weekly food-waste digest"));
});
