import assert from "node:assert/strict";

import {
  buildContents,
  buildGeminiRequestBody,
  buildInventoryContext,
  isValidGeminiChatResult,
} from "./gemini.ts";
import type { InventoryItem } from "./types.ts";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "item-1",
  name: "牛乳",
  category_id: null,
  storage_location_id: null,
  units: 2,
  content_amount: 500,
  content_unit: "mL",
  opened_remaining: null,
  expiry_date: "2026-07-10",
  deleted_at: null,
  categories: { name: "飲料" },
  storage_locations: { name: "冷蔵庫" },
  ...overrides,
});

// isValidGeminiChatResult

Deno.test("isValidGeminiChatResult - accepts a valid result", () => {
  assert.ok(
    isValidGeminiChatResult({
      reply: "牛乳は2本あります。",
      items: [{ id: "item-1", name: "牛乳" }],
    }),
  );
});

Deno.test("isValidGeminiChatResult - accepts empty items", () => {
  assert.ok(isValidGeminiChatResult({ reply: "ありません。", items: [] }));
});

Deno.test("isValidGeminiChatResult - rejects missing reply", () => {
  assert.ok(!isValidGeminiChatResult({ items: [] }));
});

Deno.test("isValidGeminiChatResult - rejects non-array items", () => {
  assert.ok(!isValidGeminiChatResult({ reply: "x", items: "nope" }));
});

Deno.test("isValidGeminiChatResult - rejects item without id", () => {
  assert.ok(!isValidGeminiChatResult({ reply: "x", items: [{ name: "牛乳" }] }));
});

// buildInventoryContext

Deno.test("buildInventoryContext - includes total_remaining and joins", () => {
  const ctx = JSON.parse(buildInventoryContext([makeItem()], []));
  assert.strictEqual(ctx.inventory.length, 1);
  assert.strictEqual(ctx.inventory[0].total_remaining, "1000mL");
  assert.strictEqual(ctx.inventory[0].category, "飲料");
  assert.strictEqual(ctx.inventory[0].storage_location, "冷蔵庫");
  assert.deepStrictEqual(ctx.recently_consumed, []);
});

Deno.test("buildInventoryContext - opened_remaining reduces total", () => {
  const ctx = JSON.parse(
    buildInventoryContext([makeItem({ units: 2, opened_remaining: 200 })], []),
  );
  // one sealed unit (500) + opened remaining (200) = 700
  assert.strictEqual(ctx.inventory[0].total_remaining, "700mL");
});

// buildContents

Deno.test("buildContents - appends the new user message after history", () => {
  const contents = buildContents("卵はある？", [
    { role: "user", text: "牛乳ある？" },
    { role: "model", text: "2本あります。" },
  ]);
  assert.strictEqual(contents.length, 3);
  assert.strictEqual(contents[2].role, "user");
  assert.strictEqual(contents[2].parts[0].text, "卵はある？");
});

Deno.test("buildContents - caps history to the most recent turns", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "model") as "user" | "model",
    text: `t${i}`,
  }));
  const contents = buildContents("now", history);
  // 8 capped history turns + 1 new message
  assert.strictEqual(contents.length, 9);
  assert.strictEqual(contents[contents.length - 1].parts[0].text, "now");
});

// buildGeminiRequestBody

Deno.test("buildGeminiRequestBody - uses thinkingBudget, not thinkingLevel (gemini-2.5-flash only supports thinkingBudget)", () => {
  const body = buildGeminiRequestBody("卵はある？", [], [makeItem()], [], "ja");
  assert.deepStrictEqual(body.generationConfig?.thinkingConfig, { thinkingBudget: 1024 });
});

// buildGeminiRequestBody - reply language (#555)

Deno.test("buildGeminiRequestBody - ja instructs a Japanese reply", () => {
  const body = buildGeminiRequestBody("卵はある？", [], [makeItem()], [], "ja");
  const text = body.systemInstruction?.parts[0]?.text ?? "";
  assert.ok(text.includes("回答(reply)は日本語の自然な会話文で"));
});

Deno.test("buildGeminiRequestBody - en instructs an English reply", () => {
  const body = buildGeminiRequestBody("do we have eggs?", [], [makeItem()], [], "en");
  const text = body.systemInstruction?.parts[0]?.text ?? "";
  assert.ok(text.includes("回答(reply)はEnglishの自然な会話文で"));
});
