import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("image-proxy handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});

Deno.test("image-proxy handler - rejects a request without auth before parsing or fetching", async () => {
  const response = await handler(
    new Request("https://example.test", { method: "POST", body: JSON.stringify({}) }),
  );
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { error: "Unauthorized" });
});

Deno.test("image-proxy handler - rejects unsupported methods before auth", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});
