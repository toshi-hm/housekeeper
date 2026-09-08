// Mirrors src/types/stats.ts's computeWeeklyWasteDigest for the Deno Edge
// Function runtime, which can't import client-side TS directly (same pattern
// as _shared/itemType.ts mirroring src/types/item.ts, #937). Keep this in
// sync with computeWeeklyWasteDigest if that logic ever changes.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RawWasteDigestItem {
  name: string;
  deleted_at: string;
}

export interface WeeklyWasteTopItem {
  name: string;
  count: number;
}

export interface WeeklyWasteDigest {
  currentWeekCount: number;
  previousWeekCount: number;
  changePercent: number | null;
  topWasted: WeeklyWasteTopItem[];
}

/** 月曜始まりの週の開始日時（UTC 0時）を返す。 */
const utcWeekStart = (date: Date): Date => {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(utcMidnight).getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  return new Date(utcMidnight - diffToMonday * MS_PER_DAY);
};

/** `now` を含む週の直前に完了した週の開始日（月曜、"YYYY-MM-DD"）を返す。
 *  waste_streaks.last_evaluated_week の値・dedupチェックに使う対象週の識別子。 */
export const targetWeekStartDateString = (now: Date): string => {
  const partialWeekStart = utcWeekStart(now);
  const currentWeekStart = new Date(partialWeekStart.getTime() - 7 * MS_PER_DAY);
  return currentWeekStart.toISOString().slice(0, 10);
};

export const computeWeeklyWasteDigest = (
  items: RawWasteDigestItem[],
  now = new Date(),
): WeeklyWasteDigest => {
  const partialWeekStart = utcWeekStart(now);
  const currentWeekStart = new Date(partialWeekStart.getTime() - 7 * MS_PER_DAY);
  const currentWeekEnd = partialWeekStart; // exclusive
  const previousWeekStart = new Date(currentWeekStart.getTime() - 7 * MS_PER_DAY);
  const previousWeekEnd = currentWeekStart; // exclusive

  const inRange = (isoDate: string, start: Date, end: Date): boolean => {
    const t = new Date(isoDate).getTime();
    return t >= start.getTime() && t < end.getTime();
  };

  const currentWeekItems = items.filter((item) =>
    inRange(item.deleted_at, currentWeekStart, currentWeekEnd),
  );
  const previousWeekItems = items.filter((item) =>
    inRange(item.deleted_at, previousWeekStart, previousWeekEnd),
  );

  const changePercent =
    previousWeekItems.length === 0
      ? null
      : Math.round(
          ((currentWeekItems.length - previousWeekItems.length) / previousWeekItems.length) * 100,
        );

  const countByName = new Map<string, number>();
  for (const item of currentWeekItems) {
    countByName.set(item.name, (countByName.get(item.name) ?? 0) + 1);
  }
  const topWasted: WeeklyWasteTopItem[] = [...countByName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);

  return {
    currentWeekCount: currentWeekItems.length,
    previousWeekCount: previousWeekItems.length,
    changePercent,
    topWasted,
  };
};
