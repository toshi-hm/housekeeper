/** JST(UTC+9)基準の「今日」を「YYYY-MM-DD」で返す。 */
export const jstTodayString = (): string => {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
};
