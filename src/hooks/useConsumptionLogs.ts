import { useQuery } from "@tanstack/react-query";

import { type Database, supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePagination";

type ConsumptionLog = Database["public"]["Tables"]["consumption_logs"]["Row"];

export const useConsumptionLogs = (itemId: string) =>
  useQuery<ConsumptionLog[]>({
    queryKey: ["consumption-logs", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consumption_logs")
        .select("*")
        .eq("item_id", itemId)
        .order("occurred_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ConsumptionLog[];
    },
    staleTime: 0,
  });

/** 統計画面のグラフ集計とデータエクスポート（#381）の両方が使う、
 *  全アイテム横断の消費ログ。`item_id` を含むのでエクスポート時の
 *  アイテム名/カテゴリ解決にも使える。 */
export interface ConsumptionLogForAggregation {
  item_id: string;
  delta_amount: number;
  delta_unit: string;
  occurred_at: string;
}

export const useAllConsumptionLogs = () =>
  useQuery<ConsumptionLogForAggregation[]>({
    queryKey: ["consumption-logs-all"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // #622: a single unbounded select silently truncates once a user's
      // consumption_logs exceed PostgREST's row cap (default 1000). Page
      // through with a stable order (occurred_at + id tiebreaker) instead.
      return fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from("consumption_logs")
          .select("item_id, delta_amount, delta_unit, occurred_at")
          .eq("user_id", user.id)
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw new Error(error.message);
        return (data ?? []) as ConsumptionLogForAggregation[];
      });
    },
    staleTime: 0,
  });
