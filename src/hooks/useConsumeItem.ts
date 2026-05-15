import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { consumeLot as consumeLotFn, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { computeConsumption, type Item } from "@/types/item";

interface ConsumeParams {
  item: Item;
  deltaAmount: number;
}

/** Consume from a single-lot item (backward compat path). */
const consumeItem = async ({ item, deltaAmount }: ConsumeParams): Promise<Item> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  // Find the earliest-created lot to consume from (FIFO)
  const { data: lots, error: lotsError } = await supabase
    .from("item_lots")
    .select("*")
    .eq("item_id", item.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (lotsError) throw lotsError;

  if (lots && lots.length > 0 && lots[0]) {
    await consumeLotFn({ lot: lots[0], item, deltaAmount });
  } else {
    // Fallback: no lots exist yet → update items table directly and create log
    const result = computeConsumption(item, deltaAmount);
    if (result.error) throw new Error(result.error);

    await supabase
      .from("items")
      .update({
        units: result.units_after,
        opened_remaining: result.opened_remaining_after,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    await supabase.from("consumption_logs").insert({
      user_id: userData.user.id,
      item_id: item.id,
      delta_amount: deltaAmount,
      delta_unit: item.content_unit,
      units_before: item.units,
      units_after: result.units_after,
      opened_remaining_before: item.opened_remaining ?? null,
      opened_remaining_after: result.opened_remaining_after,
    });

    await syncItemAggregate(item.id);
  }

  const { data: updated, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", item.id)
    .single();
  if (error) throw error;
  return updated as Item;
};

export const useConsumeItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: consumeItem,
    onSuccess: async (data) => {
      qc.setQueryData(["items", data.id], data);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: [...LOTS_KEY, data.id] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs", data.id] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
    },
  });
};
