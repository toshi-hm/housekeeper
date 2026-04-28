import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Item, ItemFormValues } from "@/types/item";

const ITEMS_KEY = ["items"] as const;

const fetchItems = async (): Promise<Item[]> => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Item[];
};

const fetchItem = async (id: string): Promise<Item> => {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Item;
};

const normalizeFormValues = (values: Partial<ItemFormValues>) => ({
  ...values,
  barcode: values.barcode || null,
  category: values.category || null,
  storage_location: values.storage_location || null,
  purchase_date: values.purchase_date || null,
  expiry_date: values.expiry_date || null,
  notes: values.notes || null,
  image_url: values.image_url || null,
});

const createItem = async (values: ItemFormValues): Promise<Item> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("items")
    .insert({
      ...normalizeFormValues(values),
      name: values.name,
      user_id: userData.user.id,
      quantity: values.quantity ?? 1,
    })
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

export const useItems = () =>
  useQuery({
    queryKey: ITEMS_KEY,
    queryFn: fetchItems,
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
