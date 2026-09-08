// send-expiry-notifications/date.ts と同一のタイムゾーン解決パターン（#660）。
// 各 Edge Function は個別にデプロイされるため、_shared/ 以外の他関数ディレクトリを
// 直接importできず（このリポジトリの既存の慣習どおり）、複製する。
// ここでは notify_at の「時」判定にしか使わないため zonedNow のみを複製する
// （zonedDateString は不要）。

/** 不正な/未知のタイムゾーン文字列であれば既定の Asia/Tokyo にフォールバックする。 */
const safeTimezone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Tokyo";
  }
};

/** 指定タイムゾーンでの現在の「時」(0-23)を返す（#660）。 */
export const zonedNowHour = (timezone: string): number => {
  const now = new Date(Date.now());
  const tz = safeTimezone(timezone);
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return Number(hourStr) % 24;
};
