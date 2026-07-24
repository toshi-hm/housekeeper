import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { LOTS_KEY, restoreLotConsumption, syncItemAggregate } from "@/hooks/useItemLots";
import { useUndoableAction } from "@/hooks/useUndoableAction";
import { ConcurrentUpdateError, OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { computeCalendarDelta, type PendingLotRemoval } from "@/types/calendar";
import type { Item } from "@/types/item";

const invalidateCalendarQueries = async (qc: ReturnType<typeof useQueryClient>, itemId: string) => {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["items"] }),
    qc.invalidateQueries({ queryKey: LOTS_KEY }),
    qc.invalidateQueries({ queryKey: ["consumption-logs", itemId] }),
    qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
  ]);
};

export const useCalendarConsume = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  const { t: tc } = useTranslation("calendar");

  // The calendar page renders its own persistent "pending removals" list
  // (CalendarPage) instead of relying on the shared toast's action button,
  // and — unlike the other flows built on this same generic hook — never
  // auto-expires a pending removal (no `durationMs`), so a checked-off lot
  // stays undo-able until the user explicitly undoes it.
  const { start, undo, pendingList } = useUndoableAction<PendingLotRemoval>({
    showToast: false,
    onUndo: async (_lotId, pending) => {
      try {
        await restoreLotConsumption({
          lotId: pending.lotId,
          itemId: pending.itemId,
          unitsBefore: pending.units,
          openedRemainingBefore: pending.openedRemaining,
          logId: pending.logId,
        });
        await invalidateCalendarQueries(qc, pending.itemId);
      } catch (err) {
        toast(err instanceof OfflineError ? t("offlineError") : t("unknownError"), "error");
        throw err;
      }
    },
  });

  const check = async (item: Item): Promise<void> => {
    try {
      requireOnline();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: lots, error } = await supabase
        .from("item_lots")
        .select("id, units, opened_remaining, expiry_date")
        .eq("item_id", item.id)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const targetLot = (lots ?? []).find((lot) => {
        if (lot.units <= 0 && lot.opened_remaining === null) return false;
        if (!lot.expiry_date) return false;
        const [y, m, d] = lot.expiry_date.split("-").map(Number) as [number, number, number];
        const exp = new Date(y, m - 1, d);
        return exp <= monthEnd;
      });

      if (!targetLot) {
        toast(tc("noEligibleLot"), "warning");
        return;
      }

      // Optimistic concurrency: only zero out the lot if it still has the
      // exact units/opened_remaining we just read. If another request
      // already consumed from this lot in the meantime, no row matches and
      // we surface a conflict instead of silently overwriting it (#432).
      let updateQuery = supabase
        .from("item_lots")
        .update({ units: 0, opened_remaining: null, updated_at: new Date().toISOString() })
        .eq("id", targetLot.id)
        .eq("units", targetLot.units);
      updateQuery =
        targetLot.opened_remaining === null
          ? updateQuery.is("opened_remaining", null)
          : updateQuery.eq("opened_remaining", targetLot.opened_remaining);
      const { data: updatedLot, error: updateError } = await updateQuery.select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!updatedLot) throw new ConcurrentUpdateError();

      const deltaAmount = computeCalendarDelta(
        targetLot.units,
        targetLot.opened_remaining,
        item.content_amount,
      );
      const { data: logData, error: logError } = await supabase
        .from("consumption_logs")
        .insert({
          user_id: user.id,
          item_id: item.id,
          delta_amount: deltaAmount,
          delta_unit: item.content_unit,
          units_before: targetLot.units,
          units_after: 0,
          opened_remaining_before: targetLot.opened_remaining,
          opened_remaining_after: null,
        })
        .select("id")
        .single();
      if (logError) {
        // Non-fatal: the lot is already zeroed and undo is still available
        // via pendingRemovals. Warn so the missing history entry doesn't go
        // unnoticed (#441).
        // oxlint-disable-next-line no-console
        console.warn("useCalendarConsume.check: consumption_logs insert failed", logError);
        toast(t("consumptionLogFailed"), "warning");
      }

      await syncItemAggregate(item.id);
      await invalidateCalendarQueries(qc, item.id);

      // Keyed by lotId (not itemId) so that checking multiple lots of the
      // same item in a row keeps every removal independently undo-able
      // instead of the latest one overwriting the previous entry (#486).
      start(targetLot.id, {
        lotId: targetLot.id,
        itemId: item.id,
        itemName: item.name,
        units: targetLot.units,
        openedRemaining: targetLot.opened_remaining,
        logId: logData?.id ?? null,
      });
    } catch (err) {
      const message =
        err instanceof OfflineError
          ? t("offlineError")
          : err instanceof ConcurrentUpdateError
            ? t("lotConflictError")
            : t("unknownError");
      toast(message, "error");
      throw err;
    }
  };

  const pendingRemovalList = pendingList.map(({ payload }) => ({
    lotId: payload.lotId,
    itemId: payload.itemId,
    itemName: payload.itemName,
  }));

  return { check, undo, pendingRemovalList };
};
