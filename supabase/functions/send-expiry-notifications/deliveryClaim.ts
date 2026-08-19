/**
 * 期限通知の当日分の送信枠（notification_logs）を確定してよいかどうかを判定する。
 *
 * #827: 従来は実送信より先にnotification_logsへクレームをupsertしていたため、
 * VAPID環境変数未設定やResend API呼び出し失敗など実送信自体が失敗した場合でも
 * クレームだけが消費され、その日は二度とリトライされなかった。有効な通知チャネル
 * のうち少なくとも1つが実際に配信できた場合のみ、送信枠を確定する。
 */
export const shouldClaimNotificationSlot = (delivery: {
  pushEnabled: boolean;
  pushDelivered: boolean;
  emailEnabled: boolean;
  emailDelivered: boolean;
}): boolean =>
  (delivery.pushEnabled && delivery.pushDelivered) ||
  (delivery.emailEnabled && delivery.emailDelivered);

/** 購読ごとのpush送信結果（成功/失敗）一覧から、少なくとも1件成功したかどうかを判定する。 */
export const wasAnyPushDelivered = (results: readonly boolean[]): boolean =>
  results.some((delivered) => delivered);
