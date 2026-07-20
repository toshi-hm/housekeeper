import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("verify-security-answer handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("verify-security-answer handler - rejects invalid password before DB access", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        answer: "answer",
        new_password: "short",
      }),
    }),
  );
  assert.strictEqual(response.status, 400);
});

Deno.test("verify-security-answer handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});
