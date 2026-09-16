/** 不正な/未知のタイムゾーン文字列であれば既定の Asia/Tokyo にフォールバックする。 */
const safeTimezone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Tokyo";
  }
};

/** 指定タイムゾーンでの「今日」を「YYYY-MM-DD」で返す（#1072）。未指定/不正な値は Asia/Tokyo にフォールバックする。 */
export const zonedTodayString = (timezone: string | null | undefined): string =>
  // en-CA ロケールは YYYY-MM-DD 形式で整形されるため、そのまま比較・保存用の
  // 日付文字列として使える（send-expiry-notifications/date.ts の zonedDateString と同じ方式）。
  new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone ?? "Asia/Tokyo"),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
