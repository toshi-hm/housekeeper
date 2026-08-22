import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("recipe-suggest handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("recipe-suggest handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});

Deno.test("recipe-suggest handler - rejects requests without an Authorization header", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ itemNames: ["牛乳"] }),
    }),
  );
  assert.strictEqual(response.status, 401);
  const body = (await response.json()) as { error: string };
  assert.strictEqual(body.error, "Unauthorized");
});
