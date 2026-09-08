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
  // #1026: タイトルは期限接近・開封後アラート両方の件数を明示する
  assert.match(content!.title, /期限間近の食材が1件/);
  assert.match(content!.title, /開封済みで推奨使用期限を過ぎたものが1件/);
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

Deno.test("buildMergedNotificationContent (#1026) - 両方非空かつ件数が異なる場合、タイトルの各件数がそれぞれの実件数と一致する（期限接近件数だけを使う旧バグの再現防止）", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [
      expiringItem({ id: "e1", name: "牛乳" }),
      expiringItem({ id: "e2", name: "卵" }),
    ],
    openedAlertItems: [
      openedItem({ id: "o1", name: "しょうゆ" }),
      openedItem({ id: "o2", name: "味噌" }),
      openedItem({ id: "o3", name: "マヨネーズ" }),
    ],
  });
  assert.notStrictEqual(content, null);
  // 期限接近セットの実件数(2件)がタイトルに現れる
  assert.match(content!.title, /2件/);
  // 開封後アラートセットの実件数(3件)もタイトルに現れる（旧実装ではここが
  // expiringItems.length のみを使っていたため欠落し、
  // notification_logs.item_count（重複除去した合計=5件）と食い違っていた）
  assert.match(content!.title, /3件/);
});

Deno.test("buildMergedNotificationContent (#1026) - 両方非空かつ消費期限を含まない場合も、combinedTitleの穏やかな文言に両方の件数が入る", () => {
  const content = buildMergedNotificationContent({
    language: "ja",
    expiringItems: [expiringItem({ expiry_type: "best_before" })],
    openedAlertItems: [openedItem()],
  });
  assert.notStrictEqual(content, null);
  assert.match(content!.title, /賞味期限（品質の目安）が近い食材が1件/);
  assert.match(content!.title, /開封済みで推奨使用期限を過ぎたものが1件/);
});

Deno.test("buildMergedNotificationContent (#967, #1026) - en言語でも同様にマージされ、タイトルに両方の件数が入る", () => {
  const content = buildMergedNotificationContent({
    language: "en",
    expiringItems: [expiringItem()],
    openedAlertItems: [openedItem()],
  });
  assert.notStrictEqual(content, null);
  assert.match(content!.title, /1 item\(s\) are expiring soon/);
  assert.match(content!.title, /1 opened item\(s\) are past their use-by date/);
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
