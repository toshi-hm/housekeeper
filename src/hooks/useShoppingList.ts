import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Item, ItemFormValues } from "@/types/item";
import type {
  PurchaseInput,
  ShoppingItem,
  ShoppingStatus,
  UpsertShoppingItemInput,
} from "@/types/shopping";

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
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async (input: UpsertShoppingItemInput) => {
      requireOnline();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shopping_list_items")
        .upsert(
          {
            id: input.id,
            user_id: user.id,
            name: input.name,
            desired_units: input.desired_units ?? 1,
            note: input.note ?? null,
            linked_item_id: input.linked_item_id ?? null,
          },
          { onConflict: "id" },
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (error) => {
      if (error instanceof OfflineError) {
        toast(t("offlineError"), "error");
      } else {
        toast(t("unknownError"), "error");
      }
    },
  });
};

export const useDeleteShoppingItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async (id: string) => {
      requireOnline();
      const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEY] });
      const snapshot = qc.getQueriesData<ShoppingItem[]>({ queryKey: [QUERY_KEY] });
      qc.setQueriesData<ShoppingItem[]>({ queryKey: [QUERY_KEY] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old,
      );
      return { snapshot };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (error, _id, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        qc.setQueryData(key, data);
      }
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

const markShoppingItemPurchased = async (shoppingItemId: string, itemId: string) => {
  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      status: "purchased",
      purchased_at: new Date().toISOString(),
      created_item_id: itemId,
    })
    .eq("id", shoppingItemId);
  if (error) throw new Error(error.message);
};

export const lotValuesFromForm = (itemValues: ItemFormValues) => ({
  units: itemValues.units ?? 1,
  opened_remaining: itemValues.opened_remaining ?? null,
  purchase_date: itemValues.purchase_date || null,
  expiry_date: itemValues.expiry_date || null,
});

export const useDeleteAllPurchasedItems = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async () => {
      requireOnline();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("shopping_list_items")
        .delete()
        .eq("user_id", user.id)
        .eq("status", "purchased");
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (error) => {
      if (error instanceof OfflineError) {
        toast(t("offlineError"), "error");
      } else {
        toast(t("unknownError"), "error");
      }
    },
  });
};

export const usePurchaseShoppingItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async ({ shoppingItemId, itemValues }: PurchaseInput) => {
      requireOnline();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fix #212: バーコードが一致するアクティブなアイテムにスタック
      if (itemValues.barcode) {
        const { data: activeItem } = await supabase
          .from("items")
          .select("*")
          .eq("user_id", user.id)
          .eq("barcode", itemValues.barcode)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();

        if (activeItem) {
          await createLot(user.id, activeItem.id, lotValuesFromForm(itemValues));
          await syncItemAggregate(activeItem.id);
          await markShoppingItemPurchased(shoppingItemId, activeItem.id);
          return activeItem as Item;
        }

        // Fix #212: ソフトデリート済みアイテムを復活
        const { data: deletedItem } = await supabase
          .from("items")
          .select("*")
          .eq("user_id", user.id)
          .eq("barcode", itemValues.barcode)
          .not("deleted_at", "is", null)
          .limit(1)
          .maybeSingle();

        if (deletedItem) {
          const { data: revived, error: reviveError } = await supabase
            .from("items")
            .update({ deleted_at: null, updated_at: new Date().toISOString() })
            .eq("id", deletedItem.id)
            .select()
            .single();
          if (reviveError) throw reviveError;
          await createLot(user.id, deletedItem.id, lotValuesFromForm(itemValues));
          await syncItemAggregate(deletedItem.id);
          await markShoppingItemPurchased(shoppingItemId, revived.id);
          return revived as Item;
        }
      }

      // バーコードなし or 既存アイテムなし → 新規作成
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

      // Fix #211: 新規アイテムのロットを作成
      await createLot(user.id, newItem.id, lotValuesFromForm(itemValues));

      await markShoppingItemPurchased(shoppingItemId, newItem.id);

      return newItem as Item;
    },
    onSuccess: async (data) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: [...LOTS_KEY, data.id] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) {
        toast(t("offlineError"), "error");
      } else {
        toast(t("unknownError"), "error");
      }
    },
  });
};
