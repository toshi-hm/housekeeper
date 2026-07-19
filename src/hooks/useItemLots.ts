import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ConcurrentUpdateError, OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import {
  computeConsumption,
  type ConsumeLotParams,
  getLotRemainingAmount,
  type ItemLot,
  roundFloat,
} from "@/types/item";

export const LOTS_KEY = ["item-lots"] as const;

const fetchLots = async (itemId: string): Promise<ItemLot[]> => {
  const { data, error } = await supabase
    .from("item_lots")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ItemLot[];
};

export const createLot = async (
  userId: string,
  itemId: string,
  lot: {
    units: number;
    opened_remaining?: number | null;
    unit_price?: number | null;
    purchase_date?: string | null;
    expiry_date?: string | null;
  },
): Promise<ItemLot> => {
  const { data, error } = await supabase
    .from("item_lots")
    .insert({
      user_id: userId,
      item_id: itemId,
      units: lot.units,
      opened_remaining: lot.opened_remaining ?? null,
      unit_price: lot.unit_price ?? null,
      purchase_date: lot.purchase_date ?? null,
      expiry_date: lot.expiry_date ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ItemLot;
};

const updateLot = async (
  lotId: string,
  values: {
    units?: number;
    opened_remaining?: number | null;
    unit_price?: number | null;
    purchase_date?: string | null;
    expiry_date?: string | null;
  },
): Promise<ItemLot> => {
  requireOnline();
  const { data, error } = await supabase
    .from("item_lots")
    .update({
      units: values.units,
      opened_remaining: values.opened_remaining,
      unit_price: values.unit_price,
      purchase_date: values.purchase_date,
      expiry_date: values.expiry_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lotId)
    .select()
    .single();
  if (error) throw error;
  return data as ItemLot;
};

/** Recompute and update the item aggregate (units, expiry_date, opened_remaining) from its lots. */
export const syncItemAggregate = async (itemId: string): Promise<void> => {
  const [{ data: lots, error: lotsError }, { data: itemRow, error: itemError }] = await Promise.all(
    [
      supabase
        .from("item_lots")
        .select("units, expiry_date, opened_remaining")
        .eq("item_id", itemId),
      supabase.from("items").select("content_amount").eq("id", itemId).single(),
    ],
  );
  if (lotsError) throw lotsError;
  if (itemError) throw itemError;

  const rows = lots ?? [];
  const totalUnits = rows.reduce((sum, l) => sum + (l.units as number), 0);

  // Only lots with actual remaining stock should count toward the item's
  // aggregate expiry_date / opened_remaining, otherwise a depleted lot's
  // leftover expiry_date keeps the item showing up in the expiry calendar.
  const contentAmount = itemRow.content_amount as number;
  const activeRows = rows.filter(
    (l) =>
      getLotRemainingAmount(l.units as number, contentAmount, l.opened_remaining as number | null) >
      0,
  );

  const expiryDates = activeRows
    .map((l) => l.expiry_date as string | null)
    .filter((d): d is string => d !== null);
  const earliestExpiry = expiryDates.length > 0 ? expiryDates.sort()[0] : null;

  // Aggregate opened_remaining/units: sum each lot's *actual* remaining
  // amount (getLotRemainingAmount already accounts for the opened package
  // within a lot) and re-derive a single (units, opened_remaining) pair that
  // reproduces that exact total via getLotRemainingAmount. Previously this
  // only kept opened_remaining when exactly one lot was open and fell back
  // to raw unit counts otherwise, which over-reported stock whenever two or
  // more lots were open at the same time (#438).
  let aggregateUnits = totalUnits;
  let aggregateOpenedRemaining: number | null = null;
  if (contentAmount > 0) {
    const totalRemaining = roundFloat(
      activeRows.reduce(
        (sum, l) =>
          sum +
          getLotRemainingAmount(
            l.units as number,
            contentAmount,
            l.opened_remaining as number | null,
          ),
        0,
      ),
    );
    const sealedUnits = Math.floor(roundFloat(totalRemaining / contentAmount));
    const openedAfter = roundFloat(totalRemaining - sealedUnits * contentAmount);
    if (openedAfter > 0) {
      aggregateUnits = sealedUnits + 1;
      aggregateOpenedRemaining = openedAfter;
    } else {
      aggregateUnits = sealedUnits;
    }
  }

  const { error: updateError } = await supabase
    .from("items")
    .update({
      units: aggregateUnits,
      expiry_date: earliestExpiry,
      opened_remaining: aggregateOpenedRemaining,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (updateError) throw updateError;
};

export interface ConsumeLotResult extends ItemLot {
  /** True when the lot itself updated successfully but the consumption_logs
   *  insert failed (non-fatal — stock is already correct, but the history
   *  entry is missing). Callers should warn the user. See #441. */
  _logInsertFailed?: boolean;
}

export const consumeLot = async ({
  lot,
  item,
  deltaAmount,
}: ConsumeLotParams): Promise<ConsumeLotResult> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const virtual = {
    units: lot.units,
    content_amount: item.content_amount,
    content_unit: item.content_unit,
    opened_remaining: lot.opened_remaining ?? null,
  };
  const result = computeConsumption(virtual, deltaAmount);
  if (result.error) throw new Error(result.error);

  // Optimistic concurrency: only apply the update if the lot still has the
  // exact units/opened_remaining we based our calculation on. If another
  // request already consumed from this lot in the meantime, no row matches
  // and we surface a conflict instead of silently overwriting the other
  // request's update (lost update, #432).
  let query = supabase
    .from("item_lots")
    .update({
      units: result.units_after,
      opened_remaining: result.opened_remaining_after,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lot.id)
    .eq("units", lot.units);
  query =
    lot.opened_remaining === null || lot.opened_remaining === undefined
      ? query.is("opened_remaining", null)
      : query.eq("opened_remaining", lot.opened_remaining);

  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  if (!data) throw new ConcurrentUpdateError();

  const { error: logError } = await supabase.from("consumption_logs").insert({
    user_id: userData.user.id,
    item_id: lot.item_id,
    delta_amount: deltaAmount,
    delta_unit: item.content_unit,
    units_before: lot.units,
    units_after: result.units_after,
    opened_remaining_before: lot.opened_remaining ?? null,
    opened_remaining_after: result.opened_remaining_after,
  });
  if (logError) {
    // Non-fatal: stock is already updated. Surfaced via _logInsertFailed so
    // the caller can warn the user (#441).
    // oxlint-disable-next-line no-console
    console.warn("consumeLot: consumption_logs insert failed", logError);
  }

  await syncItemAggregate(lot.item_id);

  return { ...(data as ItemLot), _logInsertFailed: !!logError };
};

export const useItemLots = (itemId: string) =>
  useQuery({
    queryKey: [...LOTS_KEY, itemId],
    queryFn: () => fetchLots(itemId),
    enabled: !!itemId,
    staleTime: 30_000,
  });

export const useConsumeLot = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: consumeLot,
    onSuccess: async (data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...LOTS_KEY, variables.lot.item_id] }),
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs", variables.lot.item_id] }),
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

export const useUpdateLot = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async ({
      lotId,
      itemId,
      values,
    }: {
      lotId: string;
      itemId: string;
      values: {
        units?: number;
        opened_remaining?: number | null;
        unit_price?: number | null;
        purchase_date?: string | null;
        expiry_date?: string | null;
      };
    }) => {
      const updated = await updateLot(lotId, values);
      await syncItemAggregate(itemId);
      return updated;
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...LOTS_KEY, variables.itemId] }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
