import assert from "node:assert/strict";

import {
  buildContents,
  buildGeminiRequestBody,
  buildInventoryContext,
  isValidGeminiChatResult,
} from "./gemini.ts";
import type { InventoryItem } from "./types.ts";
import { parseChatLanguage } from "./validation.ts";

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

Deno.test("parseChatLanguage - accepts supported languages", () => {
  assert.strictEqual(parseChatLanguage("ja"), "ja");
  assert.strictEqual(parseChatLanguage("en"), "en");
});

Deno.test("parseChatLanguage - falls back to Japanese for untrusted values", () => {
  assert.strictEqual(parseChatLanguage("en-US"), "ja");
  assert.strictEqual(parseChatLanguage("fr"), "ja");
  assert.strictEqual(parseChatLanguage(undefined), "ja");
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

Deno.test("buildContents - drops a stray unpaired trailing user turn from history (#554)", () => {
  // Simulates a previously failed send: the user's turn was never followed by
  // a model reply, so it's left dangling at the end of history. The client is
  // expected to purge this on its own, but this guard defends against it
  // reaching Gemini regardless.
  const contents = buildContents("卵は？", [
    { role: "user", text: "牛乳ある？" },
    { role: "model", text: "2本あります。" },
    { role: "user", text: "パンは？" },
  ]);
  assert.strictEqual(contents.length, 3);
  assert.strictEqual(contents[0].role, "user");
  assert.strictEqual(contents[0].parts[0].text, "牛乳ある？");
  assert.strictEqual(contents[1].role, "model");
  assert.strictEqual(contents[2].role, "user");
  assert.strictEqual(contents[2].parts[0].text, "卵は？");
  for (let i = 1; i < contents.length; i++) {
    assert.notStrictEqual(contents[i].role, contents[i - 1].role);
  }
});

Deno.test("buildContents - collapses consecutive same-role turns anywhere in history", () => {
  const contents = buildContents("new", [
    { role: "user", text: "a" },
    { role: "user", text: "b" },
    { role: "model", text: "c" },
  ]);
  assert.strictEqual(contents.length, 3);
  assert.strictEqual(contents[0].role, "user");
  assert.strictEqual(contents[0].parts[0].text, "b");
  assert.strictEqual(contents[1].role, "model");
  assert.strictEqual(contents[1].parts[0].text, "c");
  assert.strictEqual(contents[2].role, "user");
  assert.strictEqual(contents[2].parts[0].text, "new");
});

// buildGeminiRequestBody

Deno.test("buildGeminiRequestBody - uses thinkingBudget, not thinkingLevel (gemini-2.5-flash only supports thinkingBudget)", () => {
  const body = buildGeminiRequestBody("卵はある？", [], [makeItem()], []);
  assert.deepStrictEqual(body.generationConfig?.thinkingConfig, { thinkingBudget: 1024 });
});

Deno.test("buildGeminiRequestBody - defaults to the Japanese system prompt", () => {
  const body = buildGeminiRequestBody("卵はある？", [], [makeItem()], []);
  const text = body.systemInstruction?.parts[0]?.text ?? "";
  assert.match(text, /日本語の自然な会話文/);
});

Deno.test("buildGeminiRequestBody - uses the English system prompt when language is 'en'", () => {
  const body = buildGeminiRequestBody("Do I have eggs?", [], [makeItem()], [], "en");
  const text = body.systemInstruction?.parts[0]?.text ?? "";
  assert.match(text, /natural, concise English/);
  assert.doesNotMatch(text, /日本語の自然な会話文/);
});
