import { useQuery } from "@tanstack/react-query";

import { useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { supabase } from "@/lib/supabase";
import {
  computeCategoryStats,
  computeExpiryDistribution,
  computeMonthlyConsumption,
  type RawLog,
} from "@/types/stats";

export type {
  CategoryStat,
  ExpiryDistributionEntry,
  MonthlyConsumptionEntry,
  RawLog,
} from "@/types/stats";

export const useCategoryStats = () => {
  const { data: items = [] } = useItems({}, "created_at");
  const { data: categories = [] } = useCategories();
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  return computeCategoryStats(items, categoryMap);
};

export const useExpiryDistribution = (warningDays?: number) => {
  const { data: items = [] } = useItems({}, "created_at");
  return computeExpiryDistribution(items, warningDays);
};

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
  return computeMonthlyConsumption(logs, months);
};
