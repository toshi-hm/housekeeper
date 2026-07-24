import { useQuery } from "@tanstack/react-query";

import { useAllConsumptionLogs } from "@/hooks/useConsumptionLogs";
import { LOTS_KEY } from "@/hooks/useItemLots";
import { useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/types/item";
import {
  computeCategoryStats,
  computeCategoryValueStats,
  computeConsumptionSpeedRanking,
  computeExpiryDistribution,
  computeForecastAlerts,
  computeMonthlyConsumption,
  computeMonthlyWasteStats,
  DEFAULT_FORECAST_LOOKBACK_DAYS,
  type LotValueRow,
  type RawWasteItem,
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

export interface ConsumptionSpeedRankingEntry {
  itemId: string;
  name: string;
  dailyRate: number;
  unit: string;
  logCount: number;
  trend: "accelerating" | "decelerating" | "steady" | "insufficient-data";
}

/** 消費速度ランキング（統計ページ）。直近 windowDays 日間の消費ペースで降順ソートする。 */
export const useConsumptionSpeedRanking = (windowDays = DEFAULT_FORECAST_LOOKBACK_DAYS) => {
  const { data: logs = [], isLoading: logsLoading, isError: logsError } = useAllConsumptionLogs();
  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
  } = useItems({}, "created_at");
  const nameMap = Object.fromEntries(items.map((item) => [item.id, item.name]));
  const unitMap = new Map(items.map((item) => [item.id, item.content_unit]));
  const ranking: ConsumptionSpeedRankingEntry[] = computeConsumptionSpeedRanking(
    logs,
    unitMap,
    windowDays,
  ).map((entry) => ({ ...entry, name: nameMap[entry.itemId] ?? "?" }));
  return { ranking, isLoading: logsLoading || itemsLoading, isError: logsError || itemsError };
};

/**
 * 消費ペースからの予測残日数が thresholdDays 以内のアイテムを抽出する（低在庫アラート強化 #392）。
 * items は呼び出し側が既に取得済みのものを渡す（ダッシュボードの一覧取得と重複フェッチしないため）。
 */
export const useForecastAlerts = (
  items: Array<Pick<Item, "id" | "units" | "content_amount" | "content_unit" | "opened_remaining">>,
  thresholdDays: number,
) => {
  const { data: logs = [], isLoading, isError } = useAllConsumptionLogs();
  return { alerts: computeForecastAlerts(items, logs, thresholdDays), isLoading, isError };
};

// --- Food-waste dashboard (#494) ---

/** 廃棄理由（deletion_reason = 'expired_waste'）でソフトデリートされたアイテムを全件取得する。
 *  通常の `useItems` は `deleted_at IS NULL` でフィルタするため使えない。 */
const useAllWasteItems = () =>
  useQuery<RawWasteItem[]>({
    queryKey: ["waste-items-all"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("items")
        .select("category_id, deleted_at")
        .eq("user_id", user.id)
        .eq("deletion_reason", "expired_waste")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as RawWasteItem[];
    },
    staleTime: 0,
  });

export const useWasteStats = (months = 6) => {
  const { data: items = [], isLoading: itemsLoading, isError: itemsError } = useAllWasteItems();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useCategories();
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  return {
    data: computeMonthlyWasteStats(items, categoryMap, months),
    isLoading: itemsLoading || categoriesLoading,
    isError: itemsError || categoriesError,
  };
};
