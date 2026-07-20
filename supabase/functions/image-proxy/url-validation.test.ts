import assert from "node:assert/strict";

import {
  canInferContentTypeFromPath,
  getMatchedTypeFromHeader,
  inferContentTypeFromPath,
  isAllowedHost,
  isAllowedUrl,
  isAuthorized,
} from "./url-validation.ts";

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request("https://example.com/image-proxy", { method: "POST", headers });

// isAuthorized — guards the 401 branch in index.ts (#496).

Deno.test("isAuthorized - authorized when an Authorization header is present", () => {
  const req = makeRequest({ Authorization: "Bearer token" });
  assert.strictEqual(isAuthorized(req), true);
});

Deno.test("isAuthorized - unauthorized when the Authorization header is missing", () => {
  const req = makeRequest();
  assert.strictEqual(isAuthorized(req), false);
});

// isAllowedHost / isAllowedUrl — guards "Host not allowed" / "Redirect to
// disallowed host" (SSRF allowlist).

Deno.test("isAllowedHost - accepts a yimg.jp subdomain", () => {
  assert.strictEqual(isAllowedHost("item-shopping.c.yimg.jp"), true);
});

Deno.test("isAllowedHost - accepts shopping.yahoo.co.jp exactly", () => {
  assert.strictEqual(isAllowedHost("shopping.yahoo.co.jp"), true);
});

Deno.test("isAllowedHost - rejects an unrelated host", () => {
  assert.strictEqual(isAllowedHost("evil.example.com"), false);
});

Deno.test("isAllowedHost - rejects a suffix-spoofing host (yimg.jp.evil.com)", () => {
  assert.strictEqual(isAllowedHost("yimg.jp.evil.com"), false);
});

Deno.test("isAllowedHost - rejects a prefix-spoofing host (notyimg.jp)", () => {
  assert.strictEqual(isAllowedHost("notyimg.jp"), false);
});

Deno.test("isAllowedUrl - accepts https on an allowed host", () => {
  assert.strictEqual(isAllowedUrl(new URL("https://item-shopping.c.yimg.jp/i/a.jpg")), true);
});

Deno.test("isAllowedUrl - rejects http even on an allowed host", () => {
  assert.strictEqual(isAllowedUrl(new URL("http://item-shopping.c.yimg.jp/i/a.jpg")), false);
});

Deno.test("isAllowedUrl - rejects an https URL on a disallowed host", () => {
  assert.strictEqual(isAllowedUrl(new URL("https://evil.example.com/a.jpg")), false);
});

// inferContentTypeFromPath — fallback content-type inference from the URL path.

Deno.test("inferContentTypeFromPath - infers image/jpeg for .jpg", () => {
  assert.strictEqual(inferContentTypeFromPath("/a/b.jpg"), "image/jpeg");
});

Deno.test("inferContentTypeFromPath - infers image/jpeg for .jpeg", () => {
  assert.strictEqual(inferContentTypeFromPath("/a/b.jpeg"), "image/jpeg");
});

Deno.test("inferContentTypeFromPath - infers image/png for .png", () => {
  assert.strictEqual(inferContentTypeFromPath("/a/b.PNG"), "image/png");
});

Deno.test("inferContentTypeFromPath - infers image/webp for .webp", () => {
  assert.strictEqual(inferContentTypeFromPath("/a/b.webp"), "image/webp");
});

Deno.test("inferContentTypeFromPath - returns null for an unrecognized extension", () => {
  assert.strictEqual(inferContentTypeFromPath("/a/b.gif"), null);
});

// getMatchedTypeFromHeader — validates the upstream Content-Type response header.

Deno.test("getMatchedTypeFromHeader - matches an allowed content type", () => {
  assert.strictEqual(getMatchedTypeFromHeader("image/png"), "image/png");
});

Deno.test("getMatchedTypeFromHeader - matches with a charset suffix", () => {
  assert.strictEqual(getMatchedTypeFromHeader("image/jpeg; charset=utf-8"), "image/jpeg");
});

Deno.test("getMatchedTypeFromHeader - is case-insensitive", () => {
  assert.strictEqual(getMatchedTypeFromHeader("IMAGE/PNG"), "image/png");
});

Deno.test("getMatchedTypeFromHeader - returns null for a disallowed content type", () => {
  assert.strictEqual(getMatchedTypeFromHeader("text/html"), null);
});

// canInferContentTypeFromPath — whether it's safe to fall back to path-based inference.

Deno.test("canInferContentTypeFromPath - true for an empty content type", () => {
  assert.strictEqual(canInferContentTypeFromPath(""), true);
});

Deno.test("canInferContentTypeFromPath - true for application/octet-stream", () => {
  assert.strictEqual(canInferContentTypeFromPath("application/octet-stream"), true);
});

Deno.test("canInferContentTypeFromPath - false for a specific disallowed type", () => {
  assert.strictEqual(canInferContentTypeFromPath("text/html"), false);
});
