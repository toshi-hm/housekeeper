import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { ArchivedShoppingItem } from "@/types/shopping";

/** #365: 「購入済みをクリア」時にアーカイブされた購入履歴のクエリキー */
export const PURCHASE_HISTORY_KEY = ["purchase-history"] as const;

export const usePurchaseHistory = () => {
  return useQuery<ArchivedShoppingItem[]>({
    queryKey: PURCHASE_HISTORY_KEY,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shopping_list_archive")
        .select("*")
        .eq("user_id", user.id)
        .order("archived_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ArchivedShoppingItem[];
    },
    staleTime: 30_000,
  });
};
