/** 不正な/未知のタイムゾーン文字列であれば既定の Asia/Tokyo にフォールバックする。 */
const safeTimezone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Tokyo";
  }
};

const formatZonedDate = (date: Date, timezone: string): string =>
  // en-CA ロケールは YYYY-MM-DD 形式で整形されるため、そのまま比較・保存用の
  // 日付文字列として使える。
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** 指定タイムゾーンでの、今日から offsetDays 日後（負数なら前）の「YYYY-MM-DD」を返す（#660）。 */
export const zonedDateString = (timezone: string, offsetDays = 0): string => {
  const target = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return formatZonedDate(target, safeTimezone(timezone));
};

/** 指定タイムゾーンでの現在の「YYYY-MM-DD」と時(0-23)を返す（#660）。
 *  日付と時は同一の now から導出する（2 回読むと日付境界をまたいだ瞬間に
 *  date と hour がずれる可能性があるため）。 */
export const zonedNow = (timezone: string): { date: string; hour: number } => {
  const now = new Date(Date.now());
  const tz = safeTimezone(timezone);
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return { date: formatZonedDate(now, tz), hour: Number(hourStr) % 24 };
};
