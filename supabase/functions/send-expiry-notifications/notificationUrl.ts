export interface ExpiringItemRef {
  id: string;
}

/**
 * #671: 単一アイテムの通知はアイテム詳細へ、複数まとめての通知は期限カレンダーへ
 * ディープリンクする。カレンダー側は現状クエリパラメータでの日付指定に未対応
 * なので、画面自体への遷移とする。
 */
export const buildNotificationTargetUrl = (items: ExpiringItemRef[]): string =>
  items.length === 1 ? `/items/${items[0]!.id}` : "/calendar";
