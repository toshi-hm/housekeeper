import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("subscribe-push handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});

Deno.test("subscribe-push handler - rejects whitespace auth before creating a client", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "   " },
      body: JSON.stringify({}),
    }),
  );
  assert.strictEqual(response.status, 401);
});
