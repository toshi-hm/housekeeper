import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { consumeLot as consumeLotFn, LOTS_KEY, restoreLotConsumption } from "@/hooks/useItemLots";
import { ConcurrentUpdateError, OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { computeConsumption, type ConsumeParams, type Item } from "@/types/item";

/**
 * Enough information to reverse a `consumeItem` call. Two shapes depending
 * on which path was taken internally: a lot was found and consumed from
 * ("lot"), or the item had no lots yet and its aggregate row was updated
 * directly ("direct"). See `undoConsumeItem` (#478).
 */
export type ConsumeItemUndo =
  | {
      kind: "lot";
      itemId: string;
      lotId: string;
      unitsBefore: number;
      openedRemainingBefore: number | null;
      logId: string | null;
    }
  | {
      kind: "direct";
      itemId: string;
      unitsBefore: number;
      openedRemainingBefore: number | null;
      logId: string | null;
    };

interface ConsumeItemResult extends Item {
  _logInsertFailed?: boolean;
  _undo: ConsumeItemUndo;
}

/** Consume from a single-lot item (backward compat path). */
export const consumeItem = async ({
  item,
  deltaAmount,
  note,
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
  let undoInfo: ConsumeItemUndo;

  const targetLot = lots && lots.length > 0 ? lots[0] : undefined;
  if (targetLot) {
    const lotResult = await consumeLotFn({ lot: targetLot, item, deltaAmount, note });
    logInsertFailed = !!lotResult._logInsertFailed;
    undoInfo = {
      kind: "lot",
      itemId: item.id,
      lotId: targetLot.id,
      unitsBefore: targetLot.units,
      openedRemainingBefore: targetLot.opened_remaining ?? null,
      logId: lotResult._logId ?? null,
    };
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

    const { data: logData, error: logError } = await supabase
      .from("consumption_logs")
      .insert({
        user_id: userData.user.id,
        item_id: item.id,
        delta_amount: deltaAmount,
        delta_unit: item.content_unit,
        units_before: item.units,
        units_after: result.units_after,
        opened_remaining_before: item.opened_remaining ?? null,
        opened_remaining_after: result.opened_remaining_after,
        note: note ?? null,
      })
      .select("id")
      .single();
    if (logError) {
      // Non-fatal: stock is already updated. Surfaced via logInsertFailed
      // so the caller can warn the user (#441).
      // oxlint-disable-next-line no-console
      console.warn("consumeItem: consumption_logs insert failed", logError);
      logInsertFailed = true;
    }
    // Skip syncItemAggregate: no lots exist, so it would reset items to units=0
    undoInfo = {
      kind: "direct",
      itemId: item.id,
      unitsBefore: item.units,
      openedRemainingBefore: item.opened_remaining ?? null,
      logId: (logData as { id: string } | null)?.id ?? null,
    };
  }

  const { data: updated, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", item.id)
    .single();
  if (error) throw error;
  return { ...(updated as Item), _logInsertFailed: logInsertFailed, _undo: undoInfo };
};

/** Reverses a `consumeItem` call using the `_undo` metadata it returned (#478). */
export const undoConsumeItem = async (undo: ConsumeItemUndo): Promise<void> => {
  if (undo.kind === "lot") {
    await restoreLotConsumption({
      lotId: undo.lotId,
      itemId: undo.itemId,
      unitsBefore: undo.unitsBefore,
      openedRemainingBefore: undo.openedRemainingBefore,
      logId: undo.logId,
    });
    return;
  }

  requireOnline();
  const { error } = await supabase
    .from("items")
    .update({
      units: undo.unitsBefore,
      opened_remaining: undo.openedRemainingBefore,
      updated_at: new Date().toISOString(),
    })
    .eq("id", undo.itemId);
  if (error) throw error;

  if (undo.logId) {
    await supabase.from("consumption_logs").delete().eq("id", undo.logId);
  }
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
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
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
