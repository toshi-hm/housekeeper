import assert from "node:assert/strict";
import { recordNotificationFailure } from "./notificationFailures.ts";

Deno.test("recordNotificationFailure writes only the fixed failure payload", async () => {
  let received: unknown;
  await recordNotificationFailure(
    async (failure) => {
      received = failure;
      return { error: null };
    },
    {
      user_id: "user-1",
      notification_type: "expiry",
      channel: "email",
      failure_code: "email_delivery_failed",
    },
  );

  assert.deepEqual(received, {
    user_id: "user-1",
    notification_type: "expiry",
    channel: "email",
    failure_code: "email_delivery_failed",
  });
});

Deno.test("recordNotificationFailure does not interrupt delivery when persistence fails", async () => {
  await assert.doesNotReject(() =>
    recordNotificationFailure(async () => ({ error: new Error("private provider response") }), {
      user_id: "user-1",
      notification_type: "low_stock",
      channel: "push",
      failure_code: "push_delivery_failed",
    }),
  );
});
