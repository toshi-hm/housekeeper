import assert from "node:assert/strict";

import { sendTestEmail } from "./email.ts";

const params = {
  apiKey: "k",
  from: "a@example.test",
  to: "b@example.test",
  subject: "s",
  text: "t",
};

Deno.test("sendTestEmail - returns sent on 2xx", async () => {
  const result = await sendTestEmail(params, () =>
    Promise.resolve(new Response("{}", { status: 200 })),
  );
  assert.deepStrictEqual(result, { sent: true, error: null });
});

Deno.test("sendTestEmail - returns error on non-2xx", async () => {
  const result = await sendTestEmail(params, () =>
    Promise.resolve(new Response("bad", { status: 422 })),
  );
  assert.deepStrictEqual(result, { sent: false, error: "Failed to send test email" });
});

Deno.test("sendTestEmail - returns error instead of throwing when fetch rejects (#1135)", async () => {
  const result = await sendTestEmail(params, () => Promise.reject(new TypeError("network down")));
  assert.deepStrictEqual(result, { sent: false, error: "Failed to send test email" });
});
