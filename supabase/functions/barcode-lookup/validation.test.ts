import assert from "node:assert/strict";
import { isValidBarcode } from "./validation.ts";

Deno.test("isValidBarcode - accepts 8-digit numeric barcode", () => {
  assert.strictEqual(isValidBarcode("12345678"), true);
});

Deno.test("isValidBarcode - accepts 13-digit numeric barcode", () => {
  assert.strictEqual(isValidBarcode("4901234567894"), true);
});

Deno.test("isValidBarcode - accepts 14-digit numeric barcode", () => {
  assert.strictEqual(isValidBarcode("12345678901234"), true);
});

Deno.test("isValidBarcode - rejects fewer than 8 digits", () => {
  assert.strictEqual(isValidBarcode("1234567"), false);
});

Deno.test("isValidBarcode - rejects more than 14 digits", () => {
  assert.strictEqual(isValidBarcode("123456789012345"), false);
});

Deno.test("isValidBarcode - rejects non-numeric characters", () => {
  assert.strictEqual(isValidBarcode("1234567a"), false);
});

Deno.test("isValidBarcode - rejects empty string", () => {
  assert.strictEqual(isValidBarcode(""), false);
});

Deno.test("isValidBarcode - rejects whitespace padding", () => {
  assert.strictEqual(isValidBarcode(" 12345678 "), false);
});
