import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Item, ItemFormValues } from "@/types/item";

const ITEMS_KEY = ["items"] as const;

async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Item[];
}

async function fetchItem(id: string): Promise<Item> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Item;
}

async function createItem(values: ItemFormValues): Promise<Item> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("items")
    .insert({
      ...values,
      user_id: userData.user.id,
      quantity: values.quantity ?? 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Item;
}

async function updateItem(id: string, values: Partial<ItemFormValues>): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Item;
}

async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

export function useItems() {
  return useQuery({
    queryKey: ITEMS_KEY,
    queryFn: fetchItems,
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: [...ITEMS_KEY, id],
    queryFn: () => fetchItem(id),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<ItemFormValues>) => updateItem(id, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
}
