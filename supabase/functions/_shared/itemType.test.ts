import assert from "node:assert/strict";

import { resolveItemType } from "./itemType.ts";

Deno.test("resolveItemType (#937) - アイテム側の item_type が設定されていればそれを優先する", () => {
  assert.strictEqual(resolveItemType("daily_goods", "food"), "daily_goods");
});

Deno.test("resolveItemType (#937) - アイテム側が未設定ならカテゴリのkindにフォールバックする", () => {
  assert.strictEqual(resolveItemType(null, "daily_goods"), "daily_goods");
});

Deno.test("resolveItemType (#937) - どちらも未設定ならfoodを既定値とする", () => {
  assert.strictEqual(resolveItemType(null, null), "food");
  assert.strictEqual(resolveItemType(undefined, undefined), "food");
});
