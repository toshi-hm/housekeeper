import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { consumeLot as consumeLotFn, LOTS_KEY } from "@/hooks/useItemLots";
import { ConcurrentUpdateError, OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { computeConsumption, type ConsumeParams, type Item } from "@/types/item";

interface ConsumeItemResult extends Item {
  _logInsertFailed?: boolean;
}

/** Consume from a single-lot item (backward compat path). */
export const consumeItem = async ({
  item,
  deltaAmount,
}: ConsumeParams): Promise<ConsumeItemResult> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  // Find the lot expiring soonest (FEFO), matching the expiry-calendar's
  // consume order, so the "quick consume" shortcut doesn't leave
  // soon-to-expire stock behind in favor of newer purchases (#446).
  const { data: lots, error: lotsError } = await supabase
    .from("item_lots")
    .select("*")
    .eq("item_id", item.id)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (lotsError) throw lotsError;

  let logInsertFailed = false;

  if (lots && lots.length > 0 && lots[0]) {
    const lotResult = await consumeLotFn({ lot: lots[0], item, deltaAmount });
    logInsertFailed = !!lotResult._logInsertFailed;
  } else {
    // Fallback: no lots exist yet → update items table directly and create log
    const result = computeConsumption(item, deltaAmount);
    if (result.error) throw new Error(result.error);

    const { error: updateError } = await supabase
      .from("items")
      .update({
        units: result.units_after,
        opened_remaining: result.opened_remaining_after,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (updateError) throw updateError;

    const { error: logError } = await supabase.from("consumption_logs").insert({
      user_id: userData.user.id,
      item_id: item.id,
      delta_amount: deltaAmount,
      delta_unit: item.content_unit,
      units_before: item.units,
      units_after: result.units_after,
      opened_remaining_before: item.opened_remaining ?? null,
      opened_remaining_after: result.opened_remaining_after,
    });
    if (logError) {
      // Non-fatal: stock is already updated. Surfaced via logInsertFailed
      // so the caller can warn the user (#441).
      // oxlint-disable-next-line no-console
      console.warn("consumeItem: consumption_logs insert failed", logError);
      logInsertFailed = true;
    }
    // Skip syncItemAggregate: no lots exist, so it would reset items to units=0
  }

  const { data: updated, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", item.id)
    .single();
  if (error) throw error;
  return { ...(updated as Item), _logInsertFailed: logInsertFailed };
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
      if (data._logInsertFailed) toast(t("consumptionLogFailed"), "warning");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof ConcurrentUpdateError) toast(t("lotConflictError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
