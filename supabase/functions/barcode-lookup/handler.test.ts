import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("barcode-lookup handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("barcode-lookup handler - rejects requests without an Authorization header", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ barcode: "4901234567894" }),
    }),
  );
  assert.strictEqual(response.status, 401);
  const body = (await response.json()) as { error: string };
  assert.strictEqual(body.error, "Unauthorized");
});
