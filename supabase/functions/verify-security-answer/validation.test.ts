import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  isValidAnswerInput,
  isValidEmailInput,
  isValidNewPasswordInput,
  normalizeEmail,
  sha256hex,
} from "./validation.ts";

// isValidEmailInput / isValidAnswerInput / isValidNewPasswordInput — guard the
// three 400 "... is required" branches in index.ts (#496).

Deno.test("isValidEmailInput - accepts a non-empty string", () => {
  assert.strictEqual(isValidEmailInput("user@example.com"), true);
});

Deno.test("isValidEmailInput - rejects an empty string", () => {
  assert.strictEqual(isValidEmailInput(""), false);
});

Deno.test("isValidEmailInput - rejects undefined", () => {
  assert.strictEqual(isValidEmailInput(undefined), false);
});

Deno.test("isValidAnswerInput - accepts a non-empty string", () => {
  assert.strictEqual(isValidAnswerInput("しろ"), true);
});

Deno.test("isValidAnswerInput - rejects an empty string", () => {
  assert.strictEqual(isValidAnswerInput(""), false);
});

Deno.test("isValidAnswerInput - rejects whitespace-only input", () => {
  assert.strictEqual(isValidAnswerInput("   "), false);
});

Deno.test("isValidAnswerInput - rejects a non-string value", () => {
  assert.strictEqual(isValidAnswerInput(42), false);
});

Deno.test("isValidNewPasswordInput - accepts a non-empty string", () => {
  assert.strictEqual(isValidNewPasswordInput("new-p@ssw0rd"), true);
});

Deno.test("isValidNewPasswordInput - rejects an empty string", () => {
  assert.strictEqual(isValidNewPasswordInput(""), false);
});

Deno.test("isValidNewPasswordInput - rejects null", () => {
  assert.strictEqual(isValidNewPasswordInput(null), false);
});

Deno.test("isValidNewPasswordInput - rejects short or whitespace-containing passwords", () => {
  assert.strictEqual(isValidNewPasswordInput("short"), false);
  assert.strictEqual(isValidNewPasswordInput("password with spaces"), false);
});

// normalizeEmail

Deno.test("normalizeEmail - lowercases and trims", () => {
  assert.strictEqual(normalizeEmail("  User@Example.COM "), "user@example.com");
});

// sha256hex — cross-validated against Node's crypto module independently of
// the implementation under test, rather than a hardcoded hex fixture.

Deno.test("sha256hex - matches an independently computed SHA-256 digest", async () => {
  const input = "user-id-123:しろ";
  const expected = createHash("sha256").update(input).digest("hex");
  assert.strictEqual(await sha256hex(input), expected);
});

Deno.test("sha256hex - is deterministic for the same input", async () => {
  const a = await sha256hex("same-input");
  const b = await sha256hex("same-input");
  assert.strictEqual(a, b);
});

Deno.test("sha256hex - differs for different input", async () => {
  const a = await sha256hex("input-a");
  const b = await sha256hex("input-b");
  assert.notStrictEqual(a, b);
});

Deno.test("sha256hex - returns a 64-character lowercase hex string", async () => {
  const digest = await sha256hex("anything");
  assert.match(digest, /^[0-9a-f]{64}$/);
});
