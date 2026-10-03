const safeTimezone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Tokyo";
  }
};

export const zonedNow = (timezone: string, now = new Date()): { hour: number; date: string } => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    hour: Number(get("hour")) % 24,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
};
