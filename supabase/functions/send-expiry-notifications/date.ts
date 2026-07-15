/** JST(UTC+9)基準で、今日から offsetDays 日後（負数なら前）の「YYYY-MM-DD」を返す。 */
export const jstDateString = (offsetDays = 0): string => {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() + offsetDays);
  return jst.toISOString().split("T")[0];
};

/** JST(UTC+9)基準の「YYYY-MM-DD」と時(0-23)を返す。 */
export const jstNow = (): { date: string; hour: number } => {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { date: jstDateString(), hour: jst.getUTCHours() };
};
