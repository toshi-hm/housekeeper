import assert from "node:assert/strict";

import { sanitizeItemNames } from "./validation.ts";

Deno.test("sanitizeItemNames - passes through simple names", () => {
  assert.deepStrictEqual(sanitizeItemNames(["牛乳", "卵"]), ["牛乳", "卵"]);
});

Deno.test("sanitizeItemNames - trims whitespace", () => {
  assert.deepStrictEqual(sanitizeItemNames([" 牛乳 "]), ["牛乳"]);
});

Deno.test("sanitizeItemNames - drops empty and whitespace-only entries", () => {
  assert.deepStrictEqual(sanitizeItemNames(["牛乳", "", "   "]), ["牛乳"]);
});

Deno.test("sanitizeItemNames - drops non-string entries", () => {
  assert.deepStrictEqual(sanitizeItemNames(["牛乳", 123, null, undefined, { name: "卵" }]), [
    "牛乳",
  ]);
});

Deno.test("sanitizeItemNames - dedupes while preserving order", () => {
  assert.deepStrictEqual(sanitizeItemNames(["牛乳", "卵", "牛乳"]), ["牛乳", "卵"]);
});

Deno.test("sanitizeItemNames - caps to 5 items", () => {
  const input = ["a", "b", "c", "d", "e", "f", "g"];
  assert.deepStrictEqual(sanitizeItemNames(input), ["a", "b", "c", "d", "e"]);
});

Deno.test("sanitizeItemNames - drops names longer than 100 characters", () => {
  const tooLong = "a".repeat(101);
  assert.deepStrictEqual(sanitizeItemNames([tooLong, "牛乳"]), ["牛乳"]);
});

Deno.test("sanitizeItemNames - returns [] for non-array input", () => {
  assert.deepStrictEqual(sanitizeItemNames("牛乳"), []);
  assert.deepStrictEqual(sanitizeItemNames(null), []);
  assert.deepStrictEqual(sanitizeItemNames(undefined), []);
  assert.deepStrictEqual(sanitizeItemNames({}), []);
});

Deno.test("sanitizeItemNames - returns [] for empty array", () => {
  assert.deepStrictEqual(sanitizeItemNames([]), []);
});
