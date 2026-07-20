import { getPricedEquivalentUnits } from "@/lib/inventoryValue";
import { type ExpiryStatus, getExpiryStatus, type Item } from "@/types/item";

export interface CategoryStat {
  categoryId: string | null;
  name: string;
  count: number;
}

export interface CategoryValueStat {
  categoryId: string | null;
  name: string;
  /** カテゴリ内の在庫総額（円）。単価未設定のロットは含まれない。 */
  value: number;
}

export interface LotValueRow {
  item_id: string;
  units: number;
  opened_remaining?: number | null;
  unit_price: number | null;
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

/**
 * ロット単位の在庫データからカテゴリ別在庫総額を計算する（#342）。
 * `unit_price` が null のロットは金額不明として除外する（後方互換）。
 * `itemCategoryMap` は `item_id → category_id | null` のマッピング。
 */
export const computeCategoryValueStats = (
  lots: LotValueRow[],
  itemCategoryMap: Record<string, string | null>,
  itemContentAmountMap: Record<string, number>,
  categoryMap: Record<string, string>,
): CategoryValueStat[] => {
  const valueMap = new Map<string | null, number>();
  for (const lot of lots) {
    if (lot.unit_price === null || lot.unit_price === undefined) continue;
    if (!Object.hasOwn(itemCategoryMap, lot.item_id)) continue;
    const contentAmount = itemContentAmountMap[lot.item_id];
    if (contentAmount === undefined) continue;
    const equivalentUnits = getPricedEquivalentUnits(lot, contentAmount);
    if (equivalentUnits <= 0) continue;
    const categoryId = itemCategoryMap[lot.item_id] ?? null;
    valueMap.set(categoryId, (valueMap.get(categoryId) ?? 0) + equivalentUnits * lot.unit_price);
  }

  const stats: CategoryValueStat[] = [];
  for (const [categoryId, value] of valueMap) {
    stats.push({
      categoryId,
      name: categoryId ? (categoryMap[categoryId] ?? "?") : "__uncategorized__",
      value: Math.round(value),
    });
  }
  stats.sort((a, b) => b.value - a.value);
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
