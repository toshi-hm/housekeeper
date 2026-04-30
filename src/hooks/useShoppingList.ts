import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { ItemFormValues } from "@/types/item";

type ShoppingStatus = "planned" | "purchased";

interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  desired_units: number;
  note: string | null;
  linked_item_id: string | null;
  status: ShoppingStatus;
  purchased_at: string | null;
  created_item_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UpsertShoppingItemInput {
  id?: string;
  name: string;
  desired_units?: number;
  note?: string | null;
  linked_item_id?: string | null;
}

interface PurchaseInput {
  shoppingItemId: string;
  itemValues: ItemFormValues;
}

const QUERY_KEY = "shopping";

export const useShoppingList = (status: ShoppingStatus = "planned") => {
  return useQuery<ShoppingItem[]>({
    queryKey: [QUERY_KEY, status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShoppingItem[];
    },
    staleTime: 30_000,
  });
};

export const useUpsertShoppingItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertShoppingItemInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shopping_list_items")
        .upsert({
          id: input.id,
          user_id: user.id,
          name: input.name,
          desired_units: input.desired_units ?? 1,
          note: input.note ?? null,
          linked_item_id: input.linked_item_id ?? null,
        }, { onConflict: "id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

export const useDeleteShoppingItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

export const usePurchaseShoppingItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shoppingItemId, itemValues }: PurchaseInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: newItem, error: itemError } = await supabase
        .from("items")
        .insert({
          user_id: user.id,
          name: itemValues.name,
          barcode: itemValues.barcode ?? null,
          category_id: itemValues.category_id ?? null,
          storage_location_id: itemValues.storage_location_id ?? null,
          units: itemValues.units,
          content_amount: itemValues.content_amount,
          content_unit: itemValues.content_unit,
          opened_remaining: itemValues.opened_remaining ?? null,
          purchase_date: itemValues.purchase_date ?? null,
          expiry_date: itemValues.expiry_date ?? null,
          notes: itemValues.notes ?? null,
        })
        .select()
        .single();
      if (itemError) throw new Error(itemError.message);

      const { error: shoppingError } = await supabase
        .from("shopping_list_items")
        .update({
          status: "purchased",
          purchased_at: new Date().toISOString(),
          created_item_id: newItem.id,
        })
        .eq("id", shoppingItemId);
      if (shoppingError) throw new Error(shoppingError.message);

      return newItem;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      void qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
};
