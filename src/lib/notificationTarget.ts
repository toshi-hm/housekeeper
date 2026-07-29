const DEFAULT_NOTIFICATION_TARGET_URL = "/";

/**
 * #671: 期限接近のPush通知に対象アイテム/期限カレンダーへのディープリンクを
 * 持たせるため、`showNotification` に渡した `data.url`（送信元は
 * supabase/functions/send-expiry-notifications, send-test-notification）を
 * `notificationclick` 側で読み取る。Notification.data は仕様上 any 型で
 * 送信元も外部（プッシュサービス経由）なので、期待した形（{ url: string }）
 * でなければ既定のダッシュボードURLにフォールバックする。
 */
/** 相対パスのみ許可する。`//example.com` はプロトコル相対URLとして外部オリジンへ
 *  解決されてしまうため、単一の `/` で始まり `//` では始まらないものだけを通す。 */
const isSafeRelativePath = (value: string): boolean =>
  value.startsWith("/") && !value.startsWith("//");

export const resolveNotificationTargetUrl = (data: unknown): string => {
  if (
    typeof data === "object" &&
    data !== null &&
    "url" in data &&
    typeof (data as { url: unknown }).url === "string" &&
    isSafeRelativePath((data as { url: string }).url)
  ) {
    return (data as { url: string }).url;
  }
  return DEFAULT_NOTIFICATION_TARGET_URL;
};
