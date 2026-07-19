import { useQuery } from "@tanstack/react-query";

import { useAllConsumptionLogs } from "@/hooks/useConsumptionLogs";
import { LOTS_KEY } from "@/hooks/useItemLots";
import { useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import {
  computeCategoryStats,
  computeCategoryValueStats,
  computeExpiryDistribution,
  computeMonthlyConsumption,
  type LotValueRow,
  type RawLog,
} from "@/types/stats";

export type { RawLog } from "@/types/stats";

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

const fetchAllLotsForValue = async (): Promise<LotValueRow[]> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("item_lots")
    .select("item_id, units, opened_remaining, unit_price")
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return (data ?? []) as LotValueRow[];
};

const useAllLotsForValue = () =>
  useQuery<LotValueRow[]>({
    queryKey: [...LOTS_KEY, "value-all"],
    queryFn: fetchAllLotsForValue,
    staleTime: 30_000,
  });

/** カテゴリ別在庫総額（#342）。単価未設定のロットは集計から除外される。 */
export const useCategoryValueStats = () => {
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
  const { data: lots = [], isLoading: lotsLoading, isError: lotsError } = useAllLotsForValue();
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const itemCategoryMap = Object.fromEntries(items.map((i) => [i.id, i.category_id ?? null]));
  const itemContentAmountMap = Object.fromEntries(items.map((i) => [i.id, i.content_amount]));
  return {
    stats: computeCategoryValueStats(lots, itemCategoryMap, itemContentAmountMap, categoryMap),
    isLoading: itemsLoading || categoriesLoading || lotsLoading,
    isError: itemsError || categoriesError || lotsError,
  };
};

export const useExpiryDistribution = (warningDays?: number) => {
  const { data: items = [], isLoading, isError } = useItems({}, "created_at");
  return { distribution: computeExpiryDistribution(items, warningDays), isLoading, isError };
};

export const useMonthlyConsumption = (months = 6) => {
  const { data: logs = [], isLoading, isError } = useAllConsumptionLogs();
  return { data: computeMonthlyConsumption(logs, months), isLoading, isError };
};
