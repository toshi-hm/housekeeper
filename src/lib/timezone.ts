/** ブラウザの現在のタイムゾーン（IANA形式、例: "Asia/Tokyo"）を返す。取得できない場合は null。 */
export const detectBrowserTimezone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

const FALLBACK_TIMEZONES = [
  "Asia/Tokyo",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

/**
 * #660: 通知配信タイムゾーンの選択肢一覧。`Intl.supportedValuesOf`（ECMA-402、
 * Chrome99+/Safari15.4+ 等で利用可）が使える環境ではIANAタイムゾーンの完全な
 * 一覧を返し、無い場合は主要なタイムゾーンの小さな固定リストにフォールバック
 * する（保守コストの低い静的リストを別途持たずに済む）。
 */
export const listAvailableTimezones = (): string[] => {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supportedValuesOf === "function") {
    try {
      const zones = supportedValuesOf("timeZone");
      if (zones.length > 0) return zones;
    } catch {
      // fall through to the static fallback list
    }
  }
  return FALLBACK_TIMEZONES;
};
