import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { toWebPushSubscription } from "./push.ts";

Deno.test("push_subscriptions の行を web-push の subscription 形式 (keys 入り) に変換する", () => {
  assertEquals(
    toWebPushSubscription({
      id: "s1",
      endpoint: "https://push.example/1",
      p256dh: "pk",
      auth: "au",
    }),
    { endpoint: "https://push.example/1", keys: { p256dh: "pk", auth: "au" } },
  );
});
