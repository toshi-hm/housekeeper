import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Item, ItemFormValues } from "@/types/item";

export interface ItemFilters {
  search?: string;
  categoryId?: string;
  storageLocationId?: string;
  expiryStatus?: "expired" | "expiring-soon" | "ok" | "unknown" | "all";
  hideEmpty?: boolean;
}

export type ItemSortKey = "expiry_date" | "purchase_date" | "created_at";

const ITEMS_KEY = ["items"] as const;

const fetchItems = async (
  filters: ItemFilters = {},
  sort: ItemSortKey = "created_at",
): Promise<Item[]> => {
  let query = supabase.from("items").select("*");

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

const createItem = async (values: ItemFormValues): Promise<Item> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const normalized = normalizeFormValues(values);
  const { data, error } = await supabase
    .from("items")
    .insert({ ...normalized, name: values.name, user_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Item;
};

const updateItem = async (id: string, values: Partial<ItemFormValues>): Promise<Item> => {
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
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
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
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};

export const useUpdateItem = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<ItemFormValues>) => updateItem(id, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};
