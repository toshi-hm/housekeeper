import assert from "node:assert/strict";

import { postRequest, withStubbedSupabase } from "../_shared/handler-test-utils.ts";
import { handler } from "./index.ts";

const validBody = JSON.stringify({ image: "AAAA", mimeType: "image/jpeg" });

Deno.test("receipt-scan handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("receipt-scan handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});

Deno.test("receipt-scan handler - rejects requests without an Authorization header", async () => {
  const response = await handler(postRequest(validBody, false));
  assert.strictEqual(response.status, 401);
});

Deno.test("receipt-scan handler - rejects an invalid session", async () => {
  await withStubbedSupabase({ user: null }, async () => {
    const response = await handler(postRequest(validBody));
    assert.strictEqual(response.status, 401);
  });
});

for (const [label, raw] of [
  ["malformed JSON", "{not json"],
  ["null", "null"],
  ["an array", "[]"],
  ["a string", '"x"'],
] as const) {
  Deno.test(`receipt-scan handler - rejects a body that is ${label} without consuming the rate limit`, async () => {
    await withStubbedSupabase({}, async (calls) => {
      const response = await handler(postRequest(raw));
      assert.strictEqual(response.status, 400);
      assert.strictEqual(((await response.json()) as { error: string }).error, "Invalid JSON body");
      assert.ok(!calls.some((path) => path.includes("rate_limit")));
    });
  });
}

Deno.test("receipt-scan handler - rejects an unsupported mime type", async () => {
  await withStubbedSupabase({}, async (calls) => {
    const response = await handler(
      postRequest(JSON.stringify({ image: "AAAA", mimeType: "image/gif" })),
    );
    assert.strictEqual(response.status, 400);
    assert.strictEqual(
      ((await response.json()) as { error: string }).error,
      "unsupported_mime_type",
    );
    assert.ok(!calls.some((path) => path.includes("rate_limit")));
  });
});

Deno.test("receipt-scan handler - rejects a missing image", async () => {
  await withStubbedSupabase({}, async () => {
    const response = await handler(postRequest(JSON.stringify({ mimeType: "image/jpeg" })));
    assert.strictEqual(response.status, 413);
  });
});

Deno.test("receipt-scan handler - returns 429 with Retry-After when the rate limit is exceeded", async () => {
  await withStubbedSupabase(
    { rateLimit: { allowed: false, retry_after_seconds: 42 } },
    async () => {
      const response = await handler(postRequest(validBody));
      assert.strictEqual(response.status, 429);
      assert.strictEqual(response.headers.get("Retry-After"), "42");
      assert.strictEqual(((await response.json()) as { error: string }).error, "rate_limited");
    },
  );
});
