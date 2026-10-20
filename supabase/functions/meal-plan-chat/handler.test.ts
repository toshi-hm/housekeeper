import assert from "node:assert/strict";

import { postRequest, withStubbedSupabase } from "../_shared/handler-test-utils.ts";
import { handler } from "./index.ts";

Deno.test("meal-plan-chat handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("meal-plan-chat handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});

Deno.test("meal-plan-chat handler - rejects requests without an Authorization header", async () => {
  await withStubbedSupabase({}, async () => {
    const response = await handler(postRequest(JSON.stringify({ message: "hi" }), false));
    assert.strictEqual(response.status, 401);
  });
});

for (const [label, raw] of [
  ["malformed JSON", "{not json"],
  ["null", "null"],
  ["an array", "[]"],
] as const) {
  Deno.test(`meal-plan-chat handler - rejects a body that is ${label} without consuming the rate limit`, async () => {
    await withStubbedSupabase({}, async (calls) => {
      const response = await handler(postRequest(raw));
      assert.strictEqual(response.status, 400);
      assert.ok(!calls.some((path) => path.includes("rate_limit")));
    });
  });
}

Deno.test("meal-plan-chat handler - rejects empty and over-long messages", async () => {
  await withStubbedSupabase({}, async () => {
    const empty = await handler(postRequest(JSON.stringify({ message: "  " })));
    assert.strictEqual(empty.status, 400);
    assert.strictEqual(((await empty.json()) as { error: string }).error, "message is required");

    const long = await handler(postRequest(JSON.stringify({ message: "a".repeat(501) })));
    assert.strictEqual(long.status, 400);
    assert.strictEqual(((await long.json()) as { error: string }).error, "message is too long");
  });
});

Deno.test("meal-plan-chat handler - returns 429 with Retry-After when the rate limit is exceeded", async () => {
  await withStubbedSupabase(
    { rateLimit: { allowed: false, retry_after_seconds: 42 } },
    async () => {
      const response = await handler(postRequest(JSON.stringify({ message: "今夜の献立は？" })));
      assert.strictEqual(response.status, 429);
      assert.strictEqual(response.headers.get("Retry-After"), "42");
      assert.strictEqual(((await response.json()) as { error: string }).error, "rate_limited");
    },
  );
});
