import assert from "node:assert/strict";

import { buildNotificationTargetUrl } from "./notificationUrl.ts";

Deno.test("buildNotificationTargetUrl (#671) - 1件のみの場合はアイテム詳細へのURLを返す", () => {
  assert.strictEqual(buildNotificationTargetUrl([{ id: "item-1" }]), "/items/item-1");
});

Deno.test("buildNotificationTargetUrl (#671) - 複数件の場合はカレンダーへのURLを返す", () => {
  assert.strictEqual(buildNotificationTargetUrl([{ id: "item-1" }, { id: "item-2" }]), "/calendar");
});

Deno.test("buildNotificationTargetUrl (#671) - 0件の場合もカレンダーへのURLを返す", () => {
  assert.strictEqual(buildNotificationTargetUrl([]), "/calendar");
});
