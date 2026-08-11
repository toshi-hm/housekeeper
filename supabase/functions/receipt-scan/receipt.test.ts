import assert from "node:assert/strict";

import { buildGeminiRequestBody } from "./gemini.ts";
import {
  isValidImagePayload,
  isValidMimeType,
  isValidReceiptScanResult,
  MAX_IMAGE_BASE64_LENGTH,
  normalizeLineItem,
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

// isValidReceiptScanResult

Deno.test("isValidReceiptScanResult - accepts a valid result", () => {
  assert.ok(
    isValidReceiptScanResult({
      items: [{ name: "牛乳", quantity: 1, unitPrice: 200, confidence: "high" }],
    }),
  );
});

Deno.test("isValidReceiptScanResult - accepts an empty items array", () => {
  assert.ok(isValidReceiptScanResult({ items: [] }));
});

Deno.test("isValidReceiptScanResult - accepts null unitPrice", () => {
  assert.ok(
    isValidReceiptScanResult({
      items: [{ name: "卵", quantity: 1, unitPrice: null, confidence: "low" }],
    }),
  );
});

Deno.test("isValidReceiptScanResult - rejects a missing items field", () => {
  assert.equal(isValidReceiptScanResult({}), false);
});

Deno.test("isValidReceiptScanResult - rejects an item with an invalid confidence value", () => {
  assert.equal(
    isValidReceiptScanResult({
      items: [{ name: "牛乳", quantity: 1, unitPrice: 200, confidence: "medium" }],
    }),
    false,
  );
});

Deno.test("isValidReceiptScanResult - rejects an item with an empty name", () => {
  assert.equal(
    isValidReceiptScanResult({
      items: [{ name: "  ", quantity: 1, unitPrice: 200, confidence: "high" }],
    }),
    false,
  );
});

Deno.test("isValidReceiptScanResult - rejects a non-object value", () => {
  assert.equal(isValidReceiptScanResult(null), false);
  assert.equal(isValidReceiptScanResult("items"), false);
});

// normalizeLineItem

Deno.test("normalizeLineItem - trims the name", () => {
  const result = normalizeLineItem({
    name: "  牛乳  ",
    quantity: 1,
    unitPrice: 200,
    confidence: "high",
  });
  assert.equal(result.name, "牛乳");
});

Deno.test("normalizeLineItem - falls back to quantity 1 when quantity is 0 or negative", () => {
  assert.equal(
    normalizeLineItem({ name: "牛乳", quantity: 0, unitPrice: null, confidence: "high" }).quantity,
    1,
  );
  assert.equal(
    normalizeLineItem({ name: "牛乳", quantity: -3, unitPrice: null, confidence: "high" }).quantity,
    1,
  );
});

Deno.test("normalizeLineItem - rounds a fractional quantity", () => {
  assert.equal(
    normalizeLineItem({ name: "牛乳", quantity: 2.4, unitPrice: null, confidence: "high" })
      .quantity,
    2,
  );
});

Deno.test("normalizeLineItem - rounds unitPrice and keeps it non-negative", () => {
  assert.equal(
    normalizeLineItem({ name: "牛乳", quantity: 1, unitPrice: 199.6, confidence: "high" })
      .unitPrice,
    200,
  );
});

Deno.test("normalizeLineItem - treats a negative unitPrice as null", () => {
  assert.equal(
    normalizeLineItem({ name: "牛乳", quantity: 1, unitPrice: -10, confidence: "high" }).unitPrice,
    null,
  );
});

Deno.test("normalizeLineItem - keeps a null unitPrice as null", () => {
  assert.equal(
    normalizeLineItem({ name: "牛乳", quantity: 1, unitPrice: null, confidence: "low" }).unitPrice,
    null,
  );
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
