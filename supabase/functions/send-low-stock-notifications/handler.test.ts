import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("send-low-stock-notifications responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("send-low-stock-notifications rejects missing or invalid cron secrets", async () => {
  const previous = Deno.env.get("CRON_SECRET");
  Deno.env.set("CRON_SECRET", "expected-secret");
  try {
    const response = await handler(
      new Request("https://example.test", {
        method: "POST",
        headers: { "X-Cron-Secret": "wrong-secret" },
      }),
    );
    assert.strictEqual(response.status, 401);
  } finally {
    if (previous === undefined) Deno.env.delete("CRON_SECRET");
    else Deno.env.set("CRON_SECRET", previous);
  }
});

Deno.test("send-low-stock-notifications fails closed when CRON_SECRET is absent", async () => {
  const previous = Deno.env.get("CRON_SECRET");
  Deno.env.delete("CRON_SECRET");
  try {
    const response = await handler(
      new Request("https://example.test", {
        method: "POST",
        headers: { "X-Cron-Secret": "anything" },
      }),
    );
    assert.strictEqual(response.status, 401);
  } finally {
    if (previous !== undefined) Deno.env.set("CRON_SECRET", previous);
  }
});
