import assert from "node:assert/strict";

import {
  buildContents,
  buildGeminiRequestBody,
  buildPantryContext,
  daysUntil,
  isValidMealChatResult,
} from "./gemini.ts";
import { buildUsedItems } from "./index.ts";
import { selectCookableItems } from "./pantry.ts";
import type { PantryItem } from "./types.ts";
import { parseChatLanguage, sanitizeHistory } from "./validation.ts";

const makeItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: "item-1",
  name: "牛乳",
  units: 2,
  content_amount: 500,
  content_unit: "mL",
  opened_remaining: null,
  expiry_date: "2026-10-22",
  item_type: null,
  categories: { name: "乳製品", kind: null },
  storage_locations: { name: "冷蔵庫" },
  ...overrides,
});

Deno.test("daysUntil - counts whole days, negative when past", () => {
  assert.strictEqual(daysUntil("2026-10-22", "2026-10-20"), 2);
  assert.strictEqual(daysUntil("2026-10-20", "2026-10-20"), 0);
  assert.strictEqual(daysUntil("2026-10-18", "2026-10-20"), -2);
});

Deno.test("isValidMealChatResult - validates shape", () => {
  assert.ok(isValidMealChatResult({ reply: "肉じゃが", items: [{ id: "a", name: "じゃがいも" }] }));
  assert.ok(isValidMealChatResult({ reply: "x", items: [] }));
  assert.ok(!isValidMealChatResult({ items: [] }));
  assert.ok(!isValidMealChatResult({ reply: "x", items: [{ name: "no id" }] }));
});

Deno.test("buildPantryContext - sorts soonest-expiring first, no-expiry last", () => {
  const ctx = JSON.parse(
    buildPantryContext(
      [
        makeItem({ id: "none", name: "米", expiry_date: null }),
        makeItem({ id: "late", expiry_date: "2026-11-01" }),
        makeItem({ id: "soon", expiry_date: "2026-10-21" }),
      ],
      "2026-10-20",
    ),
  );
  assert.deepStrictEqual(
    ctx.pantry.map((p: { id: string }) => p.id),
    ["soon", "late", "none"],
  );
  assert.strictEqual(ctx.today, "2026-10-20");
  assert.strictEqual(ctx.pantry[0].days_until_expiry, 1);
  assert.strictEqual(ctx.pantry[2].days_until_expiry, null);
  assert.strictEqual(ctx.pantry[0].total_remaining, "1000mL");
});

Deno.test("selectCookableItems - keeps in-stock food only", () => {
  const items = [
    makeItem({ id: "food" }),
    makeItem({ id: "empty", units: 0 }),
    makeItem({ id: "opened-only", units: 0, opened_remaining: 100 }),
    makeItem({ id: "goods", item_type: "daily_goods" }),
    makeItem({ id: "goods-by-category", categories: { name: "日用品", kind: "daily_goods" } }),
    makeItem({
      id: "food-override",
      item_type: "food",
      categories: { name: "x", kind: "daily_goods" },
    }),
  ];
  assert.deepStrictEqual(
    selectCookableItems(items).map((i) => i.id),
    ["food", "opened-only", "food-override"],
  );
});

Deno.test("buildContents - alternates roles starting with user and caps history", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("model" as const),
    text: `t${i}`,
  }));
  const contents = buildContents("now", history);
  assert.strictEqual(contents[0].role, "user");
  assert.strictEqual(contents[contents.length - 1].parts[0].text, "now");
  contents.forEach((c, i) => {
    if (i > 0) assert.notStrictEqual(c.role, contents[i - 1].role);
  });
  assert.ok(contents.length <= 9);
});

Deno.test("buildContents - collapses a stray unpaired trailing user turn", () => {
  const contents = buildContents("new", [
    { role: "user", text: "q1" },
    { role: "model", text: "a1" },
    { role: "user", text: "stray" },
  ]);
  assert.deepStrictEqual(
    contents.map((c) => [c.role, c.parts[0].text]),
    [
      ["user", "q1"],
      ["model", "a1"],
      ["user", "new"],
    ],
  );
});

Deno.test("buildGeminiRequestBody - pins JSON mode and embeds pantry in the system prompt", () => {
  const body = buildGeminiRequestBody("献立", [], [makeItem()], "2026-10-20", "ja");
  assert.strictEqual(body.generationConfig?.responseMimeType, "application/json");
  assert.strictEqual(body.generationConfig?.thinkingConfig?.thinkingBudget, 1024);
  const system = body.systemInstruction?.parts[0].text ?? "";
  assert.ok(system.includes("献立考案アシスタント"));
  assert.ok(system.includes("牛乳"));
});

Deno.test("buildGeminiRequestBody - English prompt for en", () => {
  const body = buildGeminiRequestBody("dinner?", [], [], "2026-10-20", "en");
  assert.ok(body.systemInstruction?.parts[0].text.includes("meal-planning assistant"));
});

Deno.test("buildUsedItems - drops unknown ids and dedupes, filling from our data", () => {
  const items = [makeItem({ id: "a", name: "牛乳" })];
  const result = buildUsedItems(
    [
      { id: "a", name: "model-name" },
      { id: "a", name: "dup" },
      { id: "ghost", name: "幻の食材" },
    ],
    items,
  );
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, "牛乳");
  assert.strictEqual(result[0].storage_location, "冷蔵庫");
  assert.strictEqual(result[0].total_remaining, "1000mL");
});

Deno.test("parseChatLanguage / sanitizeHistory - validate untrusted input", () => {
  assert.strictEqual(parseChatLanguage("en"), "en");
  assert.strictEqual(parseChatLanguage("fr"), "ja");
  assert.deepStrictEqual(
    sanitizeHistory([
      { role: "user", text: "ok" },
      { role: "system", text: "bad role" },
      { role: "model", text: 1 },
      null,
    ]),
    [{ role: "user", text: "ok" }],
  );
  assert.deepStrictEqual(sanitizeHistory("nope"), []);
});
