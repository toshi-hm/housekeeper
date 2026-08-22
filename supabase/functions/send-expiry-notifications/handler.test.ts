import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("send-expiry-notifications handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 200);
});

Deno.test("send-expiry-notifications handler - rejects requests without a valid cron secret", async () => {
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
    const body = (await response.json()) as { error: string };
    assert.strictEqual(body.error, "Unauthorized");
  } finally {
    if (previous === undefined) Deno.env.delete("CRON_SECRET");
    else Deno.env.set("CRON_SECRET", previous);
  }
});

Deno.test("send-expiry-notifications handler - rejects requests when CRON_SECRET is not configured", async () => {
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
