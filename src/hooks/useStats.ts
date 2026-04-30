import { useQuery } from "@tanstack/react-query";

import { useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { supabase } from "@/lib/supabase";
import { getExpiryStatus, type ExpiryStatus } from "@/types/item";

export interface CategoryStat {
  categoryId: string | null;
  name: string;
  count: number;
}

export interface ExpiryDistributionEntry {
  status: ExpiryStatus;
  count: number;
}

export interface MonthlyConsumptionEntry {
  month: string;
  total: number;
  unit: string;
}

export const useCategoryStats = () => {
  const { data: items = [] } = useItems({}, "created_at");
  const { data: categories = [] } = useCategories();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const countMap = new Map<string | null, number>();
  for (const item of items) {
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

export const useExpiryDistribution = (warningDays?: number) => {
  const { data: items = [] } = useItems({}, "created_at");

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
    if (count > 0) {
      result.push({ status, count });
    }
  }
  return result;
};

interface RawLog {
  delta_amount: number;
  delta_unit: string;
  occurred_at: string;
}

export const useAllConsumptionLogs = () =>
  useQuery<RawLog[]>({
    queryKey: ["consumption-logs-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consumption_logs")
        .select("delta_amount, delta_unit, occurred_at")
        .order("occurred_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as RawLog[];
    },
    staleTime: 0,
  });

export const useMonthlyConsumption = (months = 6) => {
  const { data: logs = [] } = useAllConsumptionLogs();

  const now = new Date();
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

    if (unitTotals.size === 0) {
      result.push({ month: label, total: 0, unit: "" });
    } else {
      const [dominantUnit, total] = [...unitTotals.entries()].sort((a, b) => b[1] - a[1])[0];
      result.push({ month: label, total: Math.round(total * 100) / 100, unit: dominantUnit });
    }
  }

  return result;
};
