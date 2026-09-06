import assert from "node:assert/strict";

import { buildGeminiRequestBody } from "./gemini.ts";
import {
  isValidImagePayload,
  isValidMimeType,
  isValidShelfScanResult,
  MAX_IMAGE_BASE64_LENGTH,
  normalizeShelfScanItems,
} from "./validation.ts";

// isValidMimeType

Deno.test("isValidMimeType - accepts supported image types", () => {
  assert.ok(isValidMimeType("image/jpeg"));
  assert.ok(isValidMimeType("image/png"));
  assert.ok(isValidMimeType("image/webp"));
});

Deno.test("isValidMimeType - rejects unsupported types", () => {
  assert.equal(isValidMimeType("image/gif"), false);
  assert.equal(isValidMimeType("application/pdf"), false);
  assert.equal(isValidMimeType(undefined), false);
  assert.equal(isValidMimeType(123), false);
});

// isValidImagePayload

Deno.test("isValidImagePayload - accepts a non-empty string within the size cap", () => {
  assert.ok(isValidImagePayload("a".repeat(100)));
});

Deno.test("isValidImagePayload - rejects an empty string", () => {
  assert.equal(isValidImagePayload(""), false);
});

Deno.test("isValidImagePayload - rejects a payload over the size cap", () => {
  assert.equal(isValidImagePayload("a".repeat(MAX_IMAGE_BASE64_LENGTH + 1)), false);
});

Deno.test("isValidImagePayload - accepts a payload exactly at the size cap", () => {
  assert.ok(isValidImagePayload("a".repeat(MAX_IMAGE_BASE64_LENGTH)));
});

Deno.test("isValidImagePayload - rejects non-string values", () => {
  assert.equal(isValidImagePayload(12345), false);
  assert.equal(isValidImagePayload(null), false);
});

// isValidShelfScanResult

Deno.test("isValidShelfScanResult - accepts a valid result", () => {
  assert.ok(isValidShelfScanResult({ items: ["牛乳", "卵"] }));
});

Deno.test("isValidShelfScanResult - accepts an empty items array", () => {
  assert.ok(isValidShelfScanResult({ items: [] }));
});

Deno.test("isValidShelfScanResult - rejects a missing items field", () => {
  assert.equal(isValidShelfScanResult({}), false);
});

Deno.test("isValidShelfScanResult - rejects a non-array items field", () => {
  assert.equal(isValidShelfScanResult({ items: "牛乳" }), false);
});

Deno.test("isValidShelfScanResult - rejects an items array with a non-string element", () => {
  assert.equal(isValidShelfScanResult({ items: ["牛乳", 123] }), false);
});

Deno.test("isValidShelfScanResult - rejects a non-object value", () => {
  assert.equal(isValidShelfScanResult(null), false);
  assert.equal(isValidShelfScanResult("items"), false);
});

// normalizeShelfScanItems

Deno.test("normalizeShelfScanItems - trims each candidate", () => {
  assert.deepEqual(normalizeShelfScanItems(["  牛乳  ", "卵"]), ["牛乳", "卵"]);
});

Deno.test("normalizeShelfScanItems - drops candidates that are blank after trimming", () => {
  assert.deepEqual(normalizeShelfScanItems(["牛乳", "   ", ""]), ["牛乳"]);
});

Deno.test("normalizeShelfScanItems - de-duplicates identical candidates after trimming", () => {
  assert.deepEqual(normalizeShelfScanItems(["牛乳", "牛乳", " 牛乳 "]), ["牛乳"]);
});

Deno.test("normalizeShelfScanItems - preserves first-seen order", () => {
  assert.deepEqual(normalizeShelfScanItems(["卵", "牛乳", "卵"]), ["卵", "牛乳"]);
});

Deno.test("normalizeShelfScanItems - returns an empty array for an empty input", () => {
  assert.deepEqual(normalizeShelfScanItems([]), []);
});

// buildGeminiRequestBody

Deno.test("buildGeminiRequestBody - embeds the image as inlineData with the given mimeType", () => {
  const body = buildGeminiRequestBody("BASE64DATA", "image/png");
  assert.equal(body.contents.length, 1);
  const parts = body.contents[0].parts;
  const imagePart = parts.find((p) => p.inlineData);
  assert.ok(imagePart);
  assert.equal(imagePart?.inlineData?.mimeType, "image/png");
  assert.equal(imagePart?.inlineData?.data, "BASE64DATA");
});

Deno.test("buildGeminiRequestBody - requests a JSON schema response with low temperature", () => {
  const body = buildGeminiRequestBody("BASE64DATA", "image/jpeg");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.temperature, 0.1);
  assert.ok(body.generationConfig.responseSchema);
});

Deno.test("buildGeminiRequestBody - response schema requires a top-level items array of strings", () => {
  const body = buildGeminiRequestBody("BASE64DATA", "image/jpeg");
  const schema = body.generationConfig.responseSchema as {
    properties: { items: { type: string; items: { type: string } } };
    required: string[];
  };
  assert.ok(schema.properties.items);
  assert.equal(schema.properties.items.type, "array");
  assert.equal(schema.properties.items.items.type, "string");
  assert.ok(schema.required.includes("items"));
});
