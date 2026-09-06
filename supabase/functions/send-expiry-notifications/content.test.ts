import assert from "node:assert/strict";

import {
  buildMergedNotificationContent,
  type ExpiringNotificationItem,
  isSupportedLanguage,
  type OpenedAlertNotificationItem,
} from "./content.ts";

const expiringItem = (
  overrides: Partial<ExpiringNotificationItem> = {},
): ExpiringNotificationItem => ({
  id: "expiring-1",
  name: "牛乳",
  expiry_date: "2026-09-10",
  expiry_type: "use_by",
  ...overrides,
});

const openedItem = (
  overrides: Partial<OpenedAlertNotificationItem> = {},
): OpenedAlertNotificationItem => ({
  id: "opened-1",
  name: "しょうゆ",
  elapsedDays: 10,
  ...overrides,
});

Deno.test("isSupportedLanguage - jaとenのみtrueを返す", () => {
  assert.strictEqual(isSupportedLanguage("ja"), true);
  assert.strictEqual(isSupportedLanguage("en"), true);
  assert.strictEqual(isSupportedLanguage("fr"), false);
  assert.strictEqual(isSupportedLanguage(undefined), false);
  assert.strictEqual(isSupportedLanguage(null), false);
});

Deno.test("buildMergedNotificationContent (#967) - 期限接近・開封後アラートのいずれも空ならnull（送信スキップ）", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [],
    openedAlertItems: [],
  });
  assert.strictEqual(content, null);
});

Deno.test("buildMergedNotificationContent (#967) - 期限接近のみ非空なら従来通りの本文になる（開封後アラート言及なし）", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [expiringItem()],
    openedAlertItems: [],
  });
  assert.notStrictEqual(content, null);
  assert.match(content!.title, /期限間近/);
  assert.doesNotMatch(content!.body, /開封済み/);
  assert.doesNotMatch(content!.emailText, /開封後/);
});

Deno.test("buildMergedNotificationContent (#967) - 開封後アラートのみ非空でも送信する（skipしない）", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [],
    openedAlertItems: [openedItem()],
  });
  assert.notStrictEqual(content, null);
  assert.match(content!.title, /開封済みの1件が推奨使用期限を過ぎています/);
  assert.match(content!.body, /しょうゆ \(開封から10日\)/);
  assert.match(content!.emailText, /開封後の推奨使用期限を過ぎている食材:/);
});

Deno.test("buildMergedNotificationContent (#967) - 両方非空なら1件の本文に両セクションがマージされる（1日1通ポリシー維持）", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [expiringItem({ name: "牛乳" })],
    openedAlertItems: [openedItem({ name: "しょうゆ" })],
  });
  assert.notStrictEqual(content, null);
  // タイトルは期限接近セット基準（従来の文言のまま）
  assert.match(content!.title, /期限間近/);
  // 本文には両方のアイテム名が含まれる
  assert.match(content!.body, /牛乳/);
  assert.match(content!.body, /しょうゆ/);
  assert.match(content!.body, /開封済み:/);
  // 件名（body）は " / " で区切られた2セクション構成
  assert.strictEqual(content!.body.split(" / ").length, 2);
  // メール本文にも両方のセクションが含まれる
  assert.match(content!.emailText, /期限間近の食材:/);
  assert.match(content!.emailText, /開封後の推奨使用期限を過ぎている食材:/);
});

Deno.test("buildMergedNotificationContent (#967) - en言語でも同様にマージされる", () => {
  const content = buildMergedNotificationContent({
    language: "en",
    expiringItems: [expiringItem()],
    openedAlertItems: [openedItem()],
  });
  assert.notStrictEqual(content, null);
  assert.match(content!.body, /Opened items:/);
  assert.match(content!.emailText, /Opened items past their recommended use-by date:/);
});

Deno.test("buildMergedNotificationContent - 消費期限(use_by)が1件でもあれば緊急文言になる（既存仕様#714の維持確認）", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [
      expiringItem({ expiry_type: "best_before" }),
      expiringItem({ expiry_type: "use_by" }),
    ],
    openedAlertItems: [],
  });
  assert.match(content!.title, /期限間近です/);
});
