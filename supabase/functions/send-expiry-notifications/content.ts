// #630: Edge Functions can't use react-i18next, so notification copy is kept
// in a small static per-language map instead of hardcoding Japanese.
// #714: title()/itemLine() take expiry_type-aware inputs so wording/priority
// can reflect 賞味期限 (best-before, mild) vs 消費期限 (use-by, urgent).
// #967: extended with an opened-alert section (「開封してから推奨使用期限を
// 過ぎている」アイテム) so a single daily notification can cover both the
// expiry-date-based set and the opened-alert set — the spec explicitly says
// not to split this into a second daily send, so both sets share one
// title/body/email built here.
// #1026: when both sets are non-empty, the title must state both counts
// (via combinedTitle) — previously it used expiringItems.length only, so
// the opened-alert count silently vanished from the title while still being
// counted into notification_logs.item_count (dedup'd union), making the
// title's count disagree with the body/log.
export type ExpiryType = "best_before" | "use_by" | null;

export interface ExpiringNotificationItem {
  id: string;
  name: string;
  expiry_date: string;
  expiry_type: ExpiryType;
}

export interface OpenedAlertNotificationItem {
  id: string;
  name: string;
  /** `getElapsedDays(opened_at)` at query time — days since opening. */
  elapsedDays: number;
}

interface NotificationTextSet {
  title: (count: number, hasUrgent: boolean) => string;
  itemLine: (name: string, expiryDate: string, expiryType: ExpiryType) => string;
  emailIntro: string;
  openedAlertTitle: (count: number) => string;
  openedAlertSectionLabel: string;
  openedAlertLine: (name: string, elapsedDays: number) => string;
  openedAlertEmailIntro: string;
  /**
   * #1026: 期限接近セットと開封後アラートセットの両方が非空のときに使う
   * タイトル。どちらか一方の件数だけを使うと、もう一方の件数が通知タイトル
   * から欠落してしまうため、両方の件数を明示する。
   */
  combinedTitle: (expiringCount: number, openedCount: number, hasUrgent: boolean) => string;
}

export const EXPIRY_NOTIFICATION_TEXT: Record<"ja" | "en", NotificationTextSet> = {
  ja: {
    // 消費期限（安全性）を含む場合は従来通りの表現、賞味期限のみなら穏やかな表現にする
    title: (count, hasUrgent) =>
      hasUrgent
        ? `${count}件の食材が期限間近です`
        : `${count}件の食材の賞味期限（品質の目安）が近づいています`,
    itemLine: (name, expiryDate, expiryType) =>
      expiryType === "best_before"
        ? `${name} (${expiryDate}, 賞味期限)`
        : expiryType === "use_by"
          ? `${name} (${expiryDate}, 消費期限)`
          : `${name} (${expiryDate})`,
    emailIntro: "期限間近の食材:",
    openedAlertTitle: (count) => `開封済みの${count}件が推奨使用期限を過ぎています`,
    openedAlertSectionLabel: "開封済み",
    openedAlertLine: (name, elapsedDays) => `${name} (開封から${elapsedDays}日)`,
    openedAlertEmailIntro: "開封後の推奨使用期限を過ぎている食材:",
    combinedTitle: (expiringCount, openedCount, hasUrgent) =>
      hasUrgent
        ? `期限間近の食材が${expiringCount}件、開封済みで推奨使用期限を過ぎたものが${openedCount}件あります`
        : `賞味期限（品質の目安）が近い食材が${expiringCount}件、開封済みで推奨使用期限を過ぎたものが${openedCount}件あります`,
  },
  en: {
    title: (count, hasUrgent) =>
      hasUrgent
        ? `${count} item(s) are expiring soon`
        : `${count} item(s) are approaching their best-before (quality) date`,
    itemLine: (name, expiryDate, expiryType) =>
      expiryType === "best_before"
        ? `${name} (${expiryDate}, best-before)`
        : expiryType === "use_by"
          ? `${name} (${expiryDate}, use-by)`
          : `${name} (${expiryDate})`,
    emailIntro: "Items expiring soon:",
    openedAlertTitle: (count) => `${count} opened item(s) are past their recommended use-by date`,
    openedAlertSectionLabel: "Opened items",
    openedAlertLine: (name, elapsedDays) => `${name} (opened ${elapsedDays} day(s) ago)`,
    openedAlertEmailIntro: "Opened items past their recommended use-by date:",
    combinedTitle: (expiringCount, openedCount, hasUrgent) =>
      hasUrgent
        ? `${expiringCount} item(s) are expiring soon and ${openedCount} opened item(s) are past their use-by date`
        : `${expiringCount} item(s) are approaching their best-before date and ${openedCount} opened item(s) are past their use-by date`,
  },
};

export const isSupportedLanguage = (value: unknown): value is "ja" | "en" =>
  value === "ja" || value === "en";

export interface MergedNotificationContent {
  title: string;
  /** Push notification body (short, item names only, no per-section labels beyond the opened-alert one). */
  body: string;
  /** Full email body text (both sections spelled out, unlike the truncated push body). */
  emailText: string;
}

/**
 * 期限接近セット（expiringItems）と開封後アラートセット（openedAlertItems）を
 * 1件の通知にまとめる（#967）。両方とも空なら `null`（送信スキップ）。
 * どちらか一方だけでも非空なら送信する。
 */
export const buildMergedNotificationContent = (params: {
  language: "ja" | "en";
  expiringItems: readonly ExpiringNotificationItem[];
  openedAlertItems: readonly OpenedAlertNotificationItem[];
}): MergedNotificationContent | null => {
  const { language, expiringItems, openedAlertItems } = params;
  if (expiringItems.length === 0 && openedAlertItems.length === 0) return null;

  const text = EXPIRY_NOTIFICATION_TEXT[language];
  const hasUrgentItem = expiringItems.some((item) => item.expiry_type !== "best_before");

  // #1026: 両方非空なら両方の件数を明示するcombinedTitleを使う。どちらか
  // 一方のみ非空なら従来通りの単一セット用タイトルのまま。
  const title =
    expiringItems.length > 0 && openedAlertItems.length > 0
      ? text.combinedTitle(expiringItems.length, openedAlertItems.length, hasUrgentItem)
      : expiringItems.length > 0
        ? text.title(expiringItems.length, hasUrgentItem)
        : text.openedAlertTitle(openedAlertItems.length);

  const bodySections: string[] = [];
  if (expiringItems.length > 0) {
    bodySections.push(
      expiringItems
        .slice(0, 3)
        .map((item) => text.itemLine(item.name, item.expiry_date, item.expiry_type))
        .join(", "),
    );
  }
  if (openedAlertItems.length > 0) {
    bodySections.push(
      `${text.openedAlertSectionLabel}: ${openedAlertItems
        .slice(0, 3)
        .map((item) => text.openedAlertLine(item.name, item.elapsedDays))
        .join(", ")}`,
    );
  }
  const body = bodySections.join(" / ");

  const emailSections: string[] = [];
  if (expiringItems.length > 0) {
    emailSections.push(
      `${text.emailIntro}\n${expiringItems
        .map((item) => `- ${text.itemLine(item.name, item.expiry_date, item.expiry_type)}`)
        .join("\n")}`,
    );
  }
  if (openedAlertItems.length > 0) {
    emailSections.push(
      `${text.openedAlertEmailIntro}\n${openedAlertItems
        .map((item) => `- ${text.openedAlertLine(item.name, item.elapsedDays)}`)
        .join("\n")}`,
    );
  }
  const emailText = emailSections.join("\n\n");

  return { title, body, emailText };
};
