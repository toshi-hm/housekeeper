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
  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
  } = useItems({}, "created_at");
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useCategories();
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  return {
    stats: computeCategoryStats(items, categoryMap),
    isLoading: itemsLoading || categoriesLoading,
    isError: itemsError || categoriesError,
  };
};

export const useExpiryDistribution = (warningDays?: number) => {
  const { data: items = [], isLoading, isError } = useItems({}, "created_at");
  return { distribution: computeExpiryDistribution(items, warningDays), isLoading, isError };
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
  const { data: logs = [], isLoading, isError } = useAllConsumptionLogs();
  return { data: computeMonthlyConsumption(logs, months), isLoading, isError };
};
