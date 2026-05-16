/** Parse a YYYY-MM-DD date string as a local-time Date to avoid UTC off-by-one display. */
export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
