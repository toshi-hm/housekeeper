/** Parse a YYYY-MM-DD date string as a local-time Date to avoid UTC off-by-one display. */
export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** Format a Date as a local-time YYYY-MM-DD key (for day-based grouping/display). */
export const toLocalDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
