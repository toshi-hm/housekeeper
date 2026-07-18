import { type ExpiryStatus, getExpiryStatus, type Item } from "@/types/item";

export interface CategoryStat {
  categoryId: string | null;
  name: string;
  count: number;
}

export interface ExpiryDistributionEntry {
  status: ExpiryStatus;
  count: number;
}

interface UnitTotal {
  unit: string;
  total: number;
}

export interface MonthlyConsumptionEntry {
  month: string;
  totals: UnitTotal[];
}

export interface RawLog {
  delta_amount: number;
  delta_unit: string;
  occurred_at: string;
}

export const computeCategoryStats = (
  items: Pick<Item, "category_id" | "units">[],
  categoryMap: Record<string, string>,
): CategoryStat[] => {
  const countMap = new Map<string | null, number>();
  for (const item of items) {
    if (item.units === 0) continue;
    const key = item.category_id ?? null;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const stats: CategoryStat[] = [];
  for (const [categoryId, count] of countMap) {
    stats.push({
      categoryId,
      name: categoryId ? (categoryMap[categoryId] ?? "?") : "__uncategorized__",
      count,
    });
  }
  stats.sort((a, b) => b.count - a.count);
  return stats;
};

export const computeExpiryDistribution = (
  items: Pick<Item, "units" | "expiry_date">[],
  warningDays?: number,
): ExpiryDistributionEntry[] => {
  const countMap = new Map<ExpiryStatus, number>();
  for (const item of items) {
    if (item.units === 0) continue;
    const status = getExpiryStatus(item.expiry_date, warningDays);
    countMap.set(status, (countMap.get(status) ?? 0) + 1);
  }

  const result: ExpiryDistributionEntry[] = [];
  const order: ExpiryStatus[] = ["expired", "expiring-soon", "ok", "unknown"];
  for (const status of order) {
    const count = countMap.get(status) ?? 0;
    if (count > 0) result.push({ status, count });
  }
  return result;
};

export const computeMonthlyConsumption = (
  logs: RawLog[],
  months = 6,
  now = new Date(),
): MonthlyConsumptionEntry[] => {
  const result: MonthlyConsumptionEntry[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = `${year}/${String(month + 1).padStart(2, "0")}`;

    const monthLogs = logs.filter((log) => {
      const logDate = new Date(log.occurred_at);
      return logDate.getFullYear() === year && logDate.getMonth() === month;
    });

    const unitTotals = new Map<string, number>();
    for (const log of monthLogs) {
      unitTotals.set(log.delta_unit, (unitTotals.get(log.delta_unit) ?? 0) + log.delta_amount);
    }

    // Keep a separate total per unit instead of collapsing to the single
    // most-common unit — mixing units in one sum would be meaningless, and
    // silently dropping the non-dominant units loses real consumption data.
    const totals: UnitTotal[] = [...unitTotals.entries()]
      .map(([unit, total]) => ({ unit, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    result.push({ month: label, totals });
  }

  return result;
};
