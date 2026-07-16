/** JST(UTC+9)基準の「YYYY-MM-DD」と時(0-23)を返す。 */
export const jstNow = (): { date: string; hour: number } => {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { date: jst.toISOString().split("T")[0], hour: jst.getUTCHours() };
};

/**
 * `YYYY-MM-DD` 形式の日付文字列に `days` 日を加算した日付文字列を返す。
 * `Date` のローカル/UTCタイムゾーンに依存せず、暦日の加算だけを行う。
 */
export const addDaysToDateStr = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};
