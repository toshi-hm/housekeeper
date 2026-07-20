import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("get-security-question handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("get-security-question handler - rejects malformed email before DB access", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    }),
  );
  assert.strictEqual(response.status, 400);
});

Deno.test("get-security-question handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});
