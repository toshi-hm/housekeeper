import assert from "node:assert/strict";
import { shouldClaimNotificationSlot, wasAnyPushDelivered } from "./deliveryClaim.ts";

// shouldClaimNotificationSlot

Deno.test("shouldClaimNotificationSlot - pushのみ有効で配信成功なら確定する", () => {
  const result = shouldClaimNotificationSlot({
    pushEnabled: true,
    pushDelivered: true,
    emailEnabled: false,
    emailDelivered: false,
  });
  assert.strictEqual(result, true);
});

Deno.test("shouldClaimNotificationSlot (#827) - pushのみ有効だがVAPID未設定等で配信失敗した場合は確定しない", () => {
  const result = shouldClaimNotificationSlot({
    pushEnabled: true,
    pushDelivered: false,
    emailEnabled: false,
    emailDelivered: false,
  });
  assert.strictEqual(result, false);
});

Deno.test("shouldClaimNotificationSlot (#827) - emailのみ有効だがResend API失敗の場合は確定しない", () => {
  const result = shouldClaimNotificationSlot({
    pushEnabled: false,
    pushDelivered: false,
    emailEnabled: true,
    emailDelivered: false,
  });
  assert.strictEqual(result, false);
});

Deno.test("shouldClaimNotificationSlot - push/emailどちらも有効で片方だけ配信成功しても確定する", () => {
  const result = shouldClaimNotificationSlot({
    pushEnabled: true,
    pushDelivered: false,
    emailEnabled: true,
    emailDelivered: true,
  });
  assert.strictEqual(result, true);
});

Deno.test("shouldClaimNotificationSlot - どちらも有効だが両方失敗した場合は確定しない", () => {
  const result = shouldClaimNotificationSlot({
    pushEnabled: true,
    pushDelivered: false,
    emailEnabled: true,
    emailDelivered: false,
  });
  assert.strictEqual(result, false);
});

// wasAnyPushDelivered

Deno.test("wasAnyPushDelivered - 全件成功なら true", () => {
  assert.strictEqual(wasAnyPushDelivered([true]), true);
});

Deno.test("wasAnyPushDelivered - 一部成功なら true", () => {
  assert.strictEqual(wasAnyPushDelivered([false, true]), true);
});

Deno.test("wasAnyPushDelivered - 全件失敗なら false", () => {
  assert.strictEqual(wasAnyPushDelivered([false, false]), false);
});

Deno.test("wasAnyPushDelivered - 送信対象が0件なら false", () => {
  assert.strictEqual(wasAnyPushDelivered([]), false);
});
