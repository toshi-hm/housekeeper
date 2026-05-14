import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import type { Item, ItemLot } from "@/types/item";
import { computeConsumption } from "@/types/item";

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
      purchase_date: lot.purchase_date ?? null,
      expiry_date: lot.expiry_date ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ItemLot;
};

/** Recompute and update the item aggregate (units + expiry_date) from its lots. */
export const syncItemAggregate = async (itemId: string): Promise<void> => {
  const { data: lots } = await supabase
    .from("item_lots")
    .select("units, expiry_date")
    .eq("item_id", itemId);

  const totalUnits = (lots ?? []).reduce((sum, l) => sum + (l.units as number), 0);
  const expiryDates = (lots ?? [])
    .map((l) => l.expiry_date as string | null)
    .filter((d): d is string => d !== null);
  const earliestExpiry = expiryDates.length > 0 ? expiryDates.sort()[0] : null;

  await supabase
    .from("items")
    .update({
      units: totalUnits,
      expiry_date: earliestExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
};

interface ConsumeLotParams {
  lot: ItemLot;
  item: Pick<Item, "content_amount" | "content_unit">;
  deltaAmount: number;
}

export const consumeLot = async ({ lot, item, deltaAmount }: ConsumeLotParams): Promise<ItemLot> => {
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

  const { data, error } = await supabase
    .from("item_lots")
    .update({
      units: result.units_after,
      opened_remaining: result.opened_remaining_after,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lot.id)
    .select()
    .single();
  if (error) throw error;

  await supabase.from("consumption_logs").insert({
    user_id: userData.user.id,
    item_id: lot.item_id,
    delta_amount: deltaAmount,
    delta_unit: item.content_unit,
    units_before: lot.units,
    units_after: result.units_after,
    opened_remaining_before: lot.opened_remaining ?? null,
    opened_remaining_after: result.opened_remaining_after,
  });

  await syncItemAggregate(lot.item_id);

  return data as ItemLot;
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
  return useMutation({
    mutationFn: consumeLot,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...LOTS_KEY, variables.lot.item_id] }),
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs", variables.lot.item_id] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
      ]);
    },
  });
};
