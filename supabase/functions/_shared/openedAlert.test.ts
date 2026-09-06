import assert from "node:assert/strict";

import {
  getElapsedDays,
  isOpenedAlertDue,
  resolveOpenedAlertThresholdDays,
} from "./openedAlert.ts";

const daysAgo = (days: number): string => new Date(Date.now() - days * 86400000).toISOString();

Deno.test("resolveOpenedAlertThresholdDays (#967) - アイテム個別の上書きがカテゴリ既定より優先される", () => {
  assert.strictEqual(
    resolveOpenedAlertThresholdDays({ days_use_after_opening: 5 }, { days_use_after_opening: 30 }),
    5,
  );
});

Deno.test("resolveOpenedAlertThresholdDays (#967) - アイテム個別が未設定ならカテゴリ既定にフォールバックする", () => {
  assert.strictEqual(
    resolveOpenedAlertThresholdDays(
      { days_use_after_opening: null },
      { days_use_after_opening: 14 },
    ),
    14,
  );
});

Deno.test("resolveOpenedAlertThresholdDays (#967) - どちらも未設定ならnullを返す", () => {
  assert.strictEqual(
    resolveOpenedAlertThresholdDays(
      { days_use_after_opening: null },
      { days_use_after_opening: null },
    ),
    null,
  );
  assert.strictEqual(resolveOpenedAlertThresholdDays({ days_use_after_opening: null }, null), null);
  assert.strictEqual(resolveOpenedAlertThresholdDays({ days_use_after_opening: null }), null);
});

Deno.test("getElapsedDays (#967) - 経過日数を切り捨てで返す", () => {
  assert.strictEqual(getElapsedDays(daysAgo(7)), 7);
});

Deno.test("getElapsedDays (#967) - sinceがnull/undefinedならnullを返す", () => {
  assert.strictEqual(getElapsedDays(null), null);
  assert.strictEqual(getElapsedDays(undefined), null);
});

Deno.test("getElapsedDays (#967) - 不正な日付文字列ならnullを返す", () => {
  assert.strictEqual(getElapsedDays("not-a-date"), null);
});

Deno.test("isOpenedAlertDue (#967) - 未開封（openedAtがnull/undefined）ならfalse", () => {
  assert.strictEqual(isOpenedAlertDue(null, 7), false);
  assert.strictEqual(isOpenedAlertDue(undefined, 7), false);
});

Deno.test("isOpenedAlertDue (#967) - 推奨日数が未設定ならfalse", () => {
  assert.strictEqual(isOpenedAlertDue(daysAgo(30), null), false);
  assert.strictEqual(isOpenedAlertDue(daysAgo(30), undefined), false);
});

Deno.test("isOpenedAlertDue (#967) - 閾値未満ならfalse", () => {
  assert.strictEqual(isOpenedAlertDue(daysAgo(2), 7), false);
});

Deno.test("isOpenedAlertDue (#967) - 閾値以上（境界含む）ならtrue", () => {
  assert.strictEqual(isOpenedAlertDue(daysAgo(7), 7), true);
  assert.strictEqual(isOpenedAlertDue(daysAgo(10), 7), true);
});

Deno.test("isOpenedAlertDue (#967) - 不正なopenedAt文字列ならfalse", () => {
  assert.strictEqual(isOpenedAlertDue("not-a-date", 7), false);
});
