import assert from "node:assert/strict";

import { planTestChannels } from "./channelPlan.ts";

Deno.test("planTestChannels - no preferences row", () => {
  assert.deepStrictEqual(planTestChannels(null), { sendPush: false, sendEmail: false });
});

Deno.test("planTestChannels - both channels disabled", () => {
  const plan = planTestChannels({ push_enabled: false, email_enabled: false, email_address: null });
  assert.deepStrictEqual(plan, { sendPush: false, sendEmail: false });
});

Deno.test("planTestChannels - push only", () => {
  const plan = planTestChannels({ push_enabled: true, email_enabled: false, email_address: null });
  assert.deepStrictEqual(plan, { sendPush: true, sendEmail: false });
});

Deno.test("planTestChannels - email enabled but no address is not sendable", () => {
  const plan = planTestChannels({ push_enabled: false, email_enabled: true, email_address: null });
  assert.deepStrictEqual(plan, { sendPush: false, sendEmail: false });
});

Deno.test("planTestChannels - email enabled with address", () => {
  const plan = planTestChannels({
    push_enabled: false,
    email_enabled: true,
    email_address: "user@example.com",
  });
  assert.deepStrictEqual(plan, { sendPush: false, sendEmail: true });
});

Deno.test("planTestChannels - both channels enabled", () => {
  const plan = planTestChannels({
    push_enabled: true,
    email_enabled: true,
    email_address: "user@example.com",
  });
  assert.deepStrictEqual(plan, { sendPush: true, sendEmail: true });
});
