import assert from "node:assert/strict";

import { isValidEmailInput, normalizeEmail } from "./validation.ts";

// isValidEmailInput — guards the 400 "email is required" branch in index.ts (#496).

Deno.test("isValidEmailInput - accepts a non-empty string", () => {
  assert.strictEqual(isValidEmailInput("user@example.com"), true);
});

Deno.test("isValidEmailInput - rejects an empty string", () => {
  assert.strictEqual(isValidEmailInput(""), false);
});

Deno.test("isValidEmailInput - rejects undefined", () => {
  assert.strictEqual(isValidEmailInput(undefined), false);
});

Deno.test("isValidEmailInput - rejects null", () => {
  assert.strictEqual(isValidEmailInput(null), false);
});

Deno.test("isValidEmailInput - rejects a non-string value", () => {
  assert.strictEqual(isValidEmailInput(12345), false);
});

Deno.test("isValidEmailInput - rejects an object", () => {
  assert.strictEqual(isValidEmailInput({ email: "user@example.com" }), false);
});

// normalizeEmail

Deno.test("normalizeEmail - lowercases the email", () => {
  assert.strictEqual(normalizeEmail("User@Example.com"), "user@example.com");
});

Deno.test("normalizeEmail - trims surrounding whitespace", () => {
  assert.strictEqual(normalizeEmail("  user@example.com  "), "user@example.com");
});

Deno.test("normalizeEmail - trims and lowercases together", () => {
  assert.strictEqual(normalizeEmail("  User@Example.COM "), "user@example.com");
});
