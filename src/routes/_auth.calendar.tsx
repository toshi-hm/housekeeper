import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CalendarPage } from "@/components/pages/CalendarPage";
import { LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { useItemsWithExpiry } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/types/item";

interface PendingLotRemoval {
  lotId: string;
  itemId: string;
  itemName: string;
  units: number;
  openedRemaining: number | null;
}

const CalendarRoutePage = () => {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useItemsWithExpiry();
  const { data: categories = [] } = useCategories();
  const [pendingRemovals, setPendingRemovals] = useState<Record<string, PendingLotRemoval>>({});

  const handleCheck = async (item: Item) => {
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

    if (!targetLot) return;

    const { error: updateError } = await supabase
      .from("item_lots")
      .update({ units: 0, opened_remaining: null, updated_at: new Date().toISOString() })
      .eq("id", targetLot.id);
    if (updateError) throw updateError;

    await syncItemAggregate(item.id);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["items"] }),
      qc.invalidateQueries({ queryKey: [...LOTS_KEY, item.id] }),
    ]);
    setPendingRemovals((prev) => ({
      ...prev,
      [item.id]: {
        lotId: targetLot.id,
        itemId: item.id,
        itemName: item.name,
        units: targetLot.units,
        openedRemaining: targetLot.opened_remaining,
      },
    }));
  };

  const handleUndo = async (itemId: string) => {
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

    await syncItemAggregate(pending.itemId);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["items"] }),
      qc.invalidateQueries({ queryKey: [...LOTS_KEY, pending.itemId] }),
    ]);
    setPendingRemovals((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  return (
    <CalendarPage
      items={items}
      categories={categories}
      isLoading={isLoading}
      onCheck={handleCheck}
      onUndo={handleUndo}
      pendingRemovals={Object.values(pendingRemovals).map(({ itemId, itemName }) => ({
        itemId,
        itemName,
      }))}
    />
  );
};

export const Route = createFileRoute("/_auth/calendar")({
  component: CalendarRoutePage,
});
