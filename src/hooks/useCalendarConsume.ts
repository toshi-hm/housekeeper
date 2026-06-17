import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { computeCalendarDelta, type PendingLotRemoval } from "@/types/calendar";
import type { Item } from "@/types/item";

const invalidateCalendarQueries = async (qc: ReturnType<typeof useQueryClient>, itemId: string) => {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["items"] }),
    qc.invalidateQueries({ queryKey: [...LOTS_KEY, itemId] }),
    qc.invalidateQueries({ queryKey: ["consumption-logs", itemId] }),
    qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
  ]);
};

export const useCalendarConsume = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  const { t: tc } = useTranslation("calendar");
  const [pendingRemovals, setPendingRemovals] = useState<Record<string, PendingLotRemoval>>({});

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

      const { error: updateError } = await supabase
        .from("item_lots")
        .update({ units: 0, opened_remaining: null, updated_at: new Date().toISOString() })
        .eq("id", targetLot.id);
      if (updateError) throw updateError;

      const deltaAmount = computeCalendarDelta(
        targetLot.units,
        targetLot.opened_remaining,
        item.content_amount,
      );
      const { data: logData } = await supabase
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

      await syncItemAggregate(item.id);
      await invalidateCalendarQueries(qc, item.id);

      setPendingRemovals((prev) => ({
        ...prev,
        [item.id]: {
          lotId: targetLot.id,
          itemId: item.id,
          itemName: item.name,
          units: targetLot.units,
          openedRemaining: targetLot.opened_remaining,
          logId: logData?.id ?? null,
        },
      }));
    } catch (err) {
      toast(err instanceof OfflineError ? t("offlineError") : t("unknownError"), "error");
      throw err;
    }
  };

  const undo = async (itemId: string): Promise<void> => {
    try {
      requireOnline();
      const pending = pendingRemovals[itemId];
      if (!pending) return;

      const { error } = await supabase
        .from("item_lots")
        .update({
          units: pending.units,
          opened_remaining: pending.openedRemaining,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending.lotId);
      if (error) throw error;

      if (pending.logId) {
        await supabase.from("consumption_logs").delete().eq("id", pending.logId);
      }

      await syncItemAggregate(pending.itemId);
      await invalidateCalendarQueries(qc, pending.itemId);

      setPendingRemovals((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      toast(err instanceof OfflineError ? t("offlineError") : t("unknownError"), "error");
    }
  };

  const pendingRemovalList = Object.values(pendingRemovals).map(({ itemId, itemName }) => ({
    itemId,
    itemName,
  }));

  return { check, undo, pendingRemovalList };
};
