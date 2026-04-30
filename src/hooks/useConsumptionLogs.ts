import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

interface ConsumptionLog {
  id: string;
  user_id: string;
  item_id: string;
  delta_amount: number;
  delta_unit: string;
  units_before: number;
  units_after: number;
  opened_remaining_before: number | null;
  opened_remaining_after: number | null;
  occurred_at: string;
}

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
