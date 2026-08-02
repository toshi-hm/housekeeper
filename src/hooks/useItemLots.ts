import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { maybeAutoReorder } from "@/lib/autoReorder";
import { ConcurrentUpdateError, OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePagination";
import { useToast } from "@/lib/toast-context";
import {
  computeConsumption,
  type ConsumeLotParams,
  getLotRemainingAmount,
  type ItemLot,
  roundFloat,
} from "@/types/item";

export const LOTS_KEY = ["item-lots"] as const;

/** 店舗名をトリムし、空文字は未設定（null）として正規化する（#697）。 */
const normalizeStoreName = (storeName: string | null | undefined): string | null => {
  if (storeName === null || storeName === undefined) return null;
  const trimmed = storeName.trim();
  return trimmed === "" ? null : trimmed;
};

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
    store_name?: string | null;
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
      store_name: normalizeStoreName(lot.store_name),
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
    store_name?: string | null;
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
      // undefined must stay undefined (dropped from the PostgREST payload) so
      // callers that omit store_name don't unintentionally wipe it out.
      store_name:
        values.store_name === undefined ? undefined : normalizeStoreName(values.store_name),
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
  /**
   * The inserted consumption_logs row id, or null when the insert failed.
   * Callers that offer an Undo action need this to delete the exact log
   * entry on undo instead of guessing the most recent one (#478).
   */
  _logId?: string | null;
}

export const consumeLot = async ({
  lot,
  item,
  deltaAmount,
  note,
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

  const { data: logData, error: logError } = await supabase
    .from("consumption_logs")
    .insert({
      user_id: userData.user.id,
      item_id: lot.item_id,
      delta_amount: deltaAmount,
      delta_unit: item.content_unit,
      units_before: lot.units,
      units_after: result.units_after,
      opened_remaining_before: lot.opened_remaining ?? null,
      opened_remaining_after: result.opened_remaining_after,
      note: note ?? null,
    })
    .select("id")
    .single();
  if (logError) {
    // Non-fatal: stock is already updated. Surfaced via _logInsertFailed so
    // the caller can warn the user (#441).
    // oxlint-disable-next-line no-console
    console.warn("consumeLot: consumption_logs insert failed", logError);
  }

  await syncItemAggregate(lot.item_id);
  await maybeAutoReorder(lot.item_id);

  return {
    ...(data as ItemLot),
    _logInsertFailed: !!logError,
    _logId: (logData as { id: string } | null)?.id ?? null,
  };
};

export interface RestoreLotConsumptionParams {
  lotId: string;
  itemId: string;
  unitsBefore: number;
  openedRemainingBefore: number | null;
  /** consumption_logs row id to delete, or null when none was recorded. */
  logId: string | null;
}

/**
 * Reverses a single lot consumption (as performed by `consumeLot` or the
 * expiry calendar's zero-out check) back to its pre-consumption state:
 * restores the lot's units/opened_remaining, deletes the corresponding
 * consumption_logs entry (if any), and resyncs the item aggregate.
 *
 * Shared by every "undo consume" flow (calendar, item consume page,
 * dashboard quick-consume) via `useUndoableAction` so the restore logic
 * lives in exactly one place (#478).
 */
export const restoreLotConsumption = async ({
  lotId,
  itemId,
  unitsBefore,
  openedRemainingBefore,
  logId,
}: RestoreLotConsumptionParams): Promise<void> => {
  requireOnline();
  const { error } = await supabase
    .from("item_lots")
    .update({
      units: unitsBefore,
      opened_remaining: openedRemainingBefore,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lotId);
  if (error) throw error;

  if (logId) {
    await supabase.from("consumption_logs").delete().eq("id", logId);
  }

  await syncItemAggregate(itemId);
};

/** データエクスポート（#381）用: ユーザーの全ロットを軽量な列だけで取得する。
 *  購入履歴は専用テーブルを持たず（`docs/specs/features/consumption-purchase.md`）、
 *  各ロットの `purchase_date` を購入イベントとして扱う。 */
interface PurchaseLotForExport {
  item_id: string;
  purchased_units: number;
  purchase_date: string | null;
  store_name: string | null;
}

const fetchAllLots = async (): Promise<PurchaseLotForExport[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  // #663: 単一の無制限selectはPostgRESTの行数上限（デフォルト1000）超過時に静かに
  // 欠落するため、fetchAllLotsForValue（useStats.ts）と同様にページングする。
  // purchase_date は同値がありうるため id を tiebreaker にして安定した順序にする。
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("item_lots")
      .select("item_id, purchased_units, purchase_date, store_name")
      .eq("user_id", userData.user.id)
      .order("purchase_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as PurchaseLotForExport[];
  });
};

export const useAllItemLots = () =>
  useQuery({
    queryKey: [...LOTS_KEY, "all"],
    queryFn: fetchAllLots,
    staleTime: 0,
  });

/** JSONバックアップ（#693）用: ユーザーの全ロットをロット単位のまま取得する。
 *  `fetchAllLots` は購入履歴CSV専用の軽量な列だけを持つため、バックアップの
 *  復元に必要な列（opened_remaining / unit_price / expiry_date）を別途取得する。 */
interface FullLotForExport {
  item_id: string;
  units: number;
  opened_remaining: number | null;
  unit_price: number | null;
  purchase_date: string | null;
  expiry_date: string | null;
  store_name: string | null;
}

const fetchAllLotsFull = async (): Promise<FullLotForExport[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  // #663と同じ理由でページングする（PostgRESTのデフォルト行数上限対策）。
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("item_lots")
      .select(
        "item_id, units, opened_remaining, unit_price, purchase_date, expiry_date, store_name, id",
      )
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as FullLotForExport[];
  });
};

export const useAllItemLotsFull = () =>
  useQuery({
    queryKey: [...LOTS_KEY, "all-full"],
    queryFn: fetchAllLotsFull,
    staleTime: 0,
  });

export const useItemLots = (itemId: string) =>
  useQuery({
    queryKey: [...LOTS_KEY, itemId],
    queryFn: () => fetchLots(itemId),
    enabled: !!itemId,
    staleTime: 30_000,
  });

/** 直近使用した店舗名（自ユーザー分、distinct・最新順・最大10件）をサジェストする（#697）。 */
const fetchStoreNameSuggestions = async (): Promise<string[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("item_lots")
    .select("store_name")
    .eq("user_id", userData.user.id)
    .not("store_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const row of (data ?? []) as { store_name: string | null }[]) {
    const name = row.store_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    suggestions.push(name);
    if (suggestions.length >= 10) break;
  }
  return suggestions;
};

export const useStoreNameSuggestions = () =>
  useQuery({
    queryKey: [...LOTS_KEY, "store-name-suggestions"],
    queryFn: fetchStoreNameSuggestions,
    staleTime: 5 * 60_000,
  });

export const useConsumeLot = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: consumeLot,
    onSuccess: async (data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs", variables.lot.item_id] }),
        qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
        // 消費で auto_reorder がトリガーされ shopping_list_items に自動追加される
        // ことがあるため、買い物リストのキャッシュも更新する (#353)。
        qc.invalidateQueries({ queryKey: ["shopping"] }),
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
        store_name?: string | null;
      };
    }) => {
      const updated = await updateLot(lotId, values);
      await syncItemAggregate(itemId);
      return updated;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
