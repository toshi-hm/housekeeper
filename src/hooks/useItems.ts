import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { type Item, type ItemFormValues, upsertItemInListCache } from "@/types/item";

/** Filters applied server-side (Supabase query). Client-only filters such as
 *  expiryStatus and hideEmpty are handled by the caller after fetching. */
export interface ItemFilters {
  search?: string;
  categoryId?: string;
  storageLocationId?: string;
}

export type ItemSortKey = "expiry_date" | "purchase_date" | "created_at";

const ITEMS_KEY = ["items"] as const;

const fetchItems = async (
  filters: ItemFilters = {},
  sort: ItemSortKey = "created_at",
): Promise<Item[]> => {
  let query = supabase.from("items").select("*").is("deleted_at", null);

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%`);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.storageLocationId) {
    query = query.eq("storage_location_id", filters.storageLocationId);
  }

  if (sort === "expiry_date") {
    query = query.order("expiry_date", { ascending: true, nullsFirst: false });
  } else {
    query = query.order(sort, { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Item[];
};

const fetchItem = async (id: string): Promise<Item> => {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Item;
};

const normalizeFormValues = (values: Partial<ItemFormValues>) => ({
  ...(values.name !== undefined && { name: values.name }),
  barcode: values.barcode || null,
  category_id: values.category_id || null,
  storage_location_id: values.storage_location_id || null,
  units: values.units ?? 1,
  content_amount: values.content_amount ?? 1,
  content_unit: values.content_unit ?? "個",
  opened_remaining:
    values.opened_remaining !== undefined && values.opened_remaining !== null
      ? values.opened_remaining
      : null,
  purchase_date: values.purchase_date || null,
  expiry_date: values.expiry_date || null,
  notes: values.notes || null,
  image_path: values.image_path || null,
});

/**
 * バーコードが一致するアクティブなアイテムを探す。
 * 見つかった場合は新規ロットを追加してそのアイテムを返す。なければ null。
 */
const tryStackToActiveItem = async (
  barcode: string,
  values: ItemFormValues,
  userId: string,
): Promise<Item | null> => {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const item = data as Item;
  await createLot(userId, item.id, {
    units: values.units ?? 1,
    opened_remaining: values.opened_remaining ?? null,
    purchase_date: values.purchase_date || null,
    expiry_date: values.expiry_date || null,
  });
  await syncItemAggregate(item.id);

  const { data: updated } = await supabase.from("items").select("*").eq("id", item.id).single();
  return updated as Item;
};

/**
 * バーコードが一致するソフトデリート済みアイテムを復活させる。
 * 復活した場合は revived item を返す。なければ null。
 */
const tryReviveItem = async (
  barcode: string,
  values: ItemFormValues,
  userId: string,
): Promise<Item | null> => {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("barcode", barcode)
    .not("deleted_at", "is", null)
    .limit(1)
    .single();
  if (!data) return null;

  const item = data as Item;
  const { data: revived, error } = await supabase
    .from("items")
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .select()
    .single();
  if (error) throw error;

  await createLot(userId, item.id, {
    units: values.units ?? 1,
    opened_remaining: values.opened_remaining ?? null,
    purchase_date: values.purchase_date || null,
    expiry_date: values.expiry_date || null,
  });
  await syncItemAggregate(item.id);

  return revived as Item;
};

const createItem = async (
  values: ItemFormValues,
): Promise<Item & { _revived?: boolean; _stacked?: boolean }> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  if (values.barcode) {
    const stacked = await tryStackToActiveItem(values.barcode, values, userData.user.id);
    if (stacked) return { ...stacked, _stacked: true };

    const revived = await tryReviveItem(values.barcode, values, userData.user.id);
    if (revived) return { ...revived, _revived: true };
  }

  const normalized = normalizeFormValues(values);
  const { data, error } = await supabase
    .from("items")
    .insert({ ...normalized, name: values.name, user_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;

  const item = data as Item;
  await createLot(userData.user.id, item.id, {
    units: values.units ?? 1,
    opened_remaining: values.opened_remaining ?? null,
    purchase_date: values.purchase_date || null,
    expiry_date: values.expiry_date || null,
  });

  return item;
};

const updateItem = async (id: string, values: Partial<ItemFormValues>): Promise<Item> => {
  requireOnline();
  const { data, error } = await supabase
    .from("items")
    .update({ ...normalizeFormValues(values), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Item;
};

const deleteItem = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
};

const softDeleteItem = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
};

/** バーコードでアクティブなアイテムを検索する (新規登録画面でのスタック検出用) */
export const findActiveItemByBarcode = async (barcode: string): Promise<Item | null> => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as Item) : null;
};

/** カレンダー用: expiry_date を持つアクティブアイテムのみ返す */
const fetchItemsWithExpiry = async (): Promise<Item[]> => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .is("deleted_at", null)
    .not("expiry_date", "is", null)
    .order("expiry_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Item[];
};

export const useItems = (filters: ItemFilters = {}, sort: ItemSortKey = "created_at") =>
  useQuery({
    queryKey: [...ITEMS_KEY, filters, sort],
    queryFn: () => fetchItems(filters, sort),
    staleTime: 30_000,
  });

export const useItem = (id: string) =>
  useQuery({
    queryKey: [...ITEMS_KEY, id],
    queryFn: () => fetchItem(id),
    enabled: !!id,
  });

export const useCreateItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["common", "calendar", "items"]);
  return useMutation({
    mutationFn: createItem,
    onSuccess: async (data) => {
      const result = data as Item & { _revived?: boolean; _stacked?: boolean };

      qc.setQueriesData<Item[]>({ queryKey: ITEMS_KEY }, (old) =>
        upsertItemInListCache(old, result),
      );
      qc.setQueryData<Item>([...ITEMS_KEY, result.id], result);

      await qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" });
      if (result._stacked || result._revived) {
        await qc.invalidateQueries({ queryKey: LOTS_KEY, refetchType: "all" });
      }
      if (result._revived) {
        toast(t("calendar:reviveSuccess"), "success");
      }
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("common:offlineError"), "error");
    },
  });
};

export const useUpdateItem = (id: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: (values: Partial<ItemFormValues>) => updateItem(id, values),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
    },
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: deleteItem,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ITEMS_KEY });
      const snapshot = qc.getQueriesData<Item[]>({ queryKey: ITEMS_KEY });
      qc.setQueriesData<Item[]>({ queryKey: ITEMS_KEY }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old,
      );
      qc.removeQueries({ queryKey: [...ITEMS_KEY, id], exact: true });
      return { snapshot };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
    onError: (error, _id, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        qc.setQueryData(key, data);
      }
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
    },
  });
};

export const useSoftDeleteItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["common", "calendar"]);
  return useMutation({
    mutationFn: softDeleteItem,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" });
      toast(t("calendar:softDeleteSuccess"), "success");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("common:offlineError"), "error");
      else toast(t("common:unknownError"), "error");
    },
  });
};

export const useItemsWithExpiry = () =>
  useQuery({
    queryKey: [...ITEMS_KEY, "with-expiry"],
    queryFn: fetchItemsWithExpiry,
    staleTime: 30_000,
  });
