import assert from "node:assert/strict";

import { isAuthorized, isValidSubscribeBody } from "./validation.ts";

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request("https://example.com/subscribe-push", { method: "POST", headers });

// isAuthorized — guards the 401 branch in index.ts (#496).

Deno.test("isAuthorized - authorized when an Authorization header is present", () => {
  const req = makeRequest({ Authorization: "Bearer token" });
  assert.strictEqual(isAuthorized(req), true);
});

Deno.test("isAuthorized - unauthorized when the Authorization header is missing", () => {
  const req = makeRequest();
  assert.strictEqual(isAuthorized(req), false);
});

Deno.test("isAuthorized - unauthorized when the Authorization header is empty", () => {
  const req = makeRequest({ Authorization: "" });
  assert.strictEqual(isAuthorized(req), false);
});

Deno.test("isAuthorized - unauthorized when the Authorization header is whitespace", () => {
  assert.strictEqual(isAuthorized(makeRequest({ Authorization: "   " })), false);
});

// isValidSubscribeBody — guards the 400 "Invalid subscription body" branch.

Deno.test("isValidSubscribeBody - accepts a valid subscribe body", () => {
  assert.strictEqual(
    isValidSubscribeBody({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    }),
    true,
  );
});

Deno.test("isValidSubscribeBody - accepts a valid unsubscribe body without keys", () => {
  assert.strictEqual(
    isValidSubscribeBody({
      action: "unsubscribe",
      endpoint: "https://push.example.com/abc",
    }),
    true,
  );
});

Deno.test("isValidSubscribeBody - rejects a missing endpoint", () => {
  assert.strictEqual(isValidSubscribeBody({ keys: { p256dh: "p", auth: "a" } }), false);
});

Deno.test("isValidSubscribeBody - rejects an empty endpoint", () => {
  assert.strictEqual(
    isValidSubscribeBody({ endpoint: "", keys: { p256dh: "p", auth: "a" } }),
    false,
  );
});

Deno.test("isValidSubscribeBody - rejects a non-HTTPS endpoint", () => {
  assert.strictEqual(
    isValidSubscribeBody({
      endpoint: "http://push.example.com/abc",
      keys: { p256dh: "p", auth: "a" },
    }),
    false,
  );
});

Deno.test("isValidSubscribeBody - rejects whitespace-only keys", () => {
  assert.strictEqual(
    isValidSubscribeBody({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: " ", auth: "a" },
    }),
    false,
  );
});

Deno.test("isValidSubscribeBody - rejects a subscribe body missing keys", () => {
  assert.strictEqual(isValidSubscribeBody({ endpoint: "https://push.example.com/abc" }), false);
});

Deno.test("isValidSubscribeBody - rejects keys missing p256dh", () => {
  assert.strictEqual(
    isValidSubscribeBody({
      endpoint: "https://push.example.com/abc",
      keys: { auth: "auth-value" },
    }),
    false,
  );
});

Deno.test("isValidSubscribeBody - rejects an invalid action value", () => {
  assert.strictEqual(
    isValidSubscribeBody({
      action: "delete-everything",
      endpoint: "https://push.example.com/abc",
    }),
    false,
  );
});

Deno.test("isValidSubscribeBody - rejects null", () => {
  assert.strictEqual(isValidSubscribeBody(null), false);
});

Deno.test("isValidSubscribeBody - rejects a non-object body", () => {
  assert.strictEqual(isValidSubscribeBody("not-an-object"), false);
});
