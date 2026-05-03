import { useQuery } from "@tanstack/react-query";

import type { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

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
