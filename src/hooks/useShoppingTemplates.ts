import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import {
  filterNewTemplateItems,
  type ShoppingTemplateItem,
  type ShoppingTemplateWithItems,
  type TemplateItemInput,
} from "@/types/shopping";

const TEMPLATES_KEY = ["shopping-templates"] as const;
const SHOPPING_KEY = ["shopping"] as const;

const fetchTemplates = async (): Promise<ShoppingTemplateWithItems[]> => {
  const { data: templates, error } = await supabase
    .from("shopping_list_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: items, error: itemsError } = await supabase
    .from("shopping_list_template_items")
    .select("*")
    .order("created_at", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const itemsByTemplate = new Map<string, ShoppingTemplateItem[]>();
  for (const item of (items ?? []) as ShoppingTemplateItem[]) {
    const list = itemsByTemplate.get(item.template_id) ?? [];
    list.push(item);
    itemsByTemplate.set(item.template_id, list);
  }

  return (templates ?? []).map((template) => ({
    ...template,
    items: itemsByTemplate.get(template.id) ?? [],
  })) as ShoppingTemplateWithItems[];
};

export const useShoppingTemplates = () =>
  useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: fetchTemplates,
    staleTime: 5 * 60_000,
  });

interface SaveTemplateInput {
  id?: string;
  name: string;
  items: TemplateItemInput[];
}

const saveTemplate = async ({ id, name, items }: SaveTemplateInput): Promise<void> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: template, error } = await supabase
    .from("shopping_list_templates")
    .upsert({ id, user_id: user.id, name }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // アイテムは入れ替え方式（既存を削除して挿入し直す）でシンプルに同期する
  const { error: deleteError } = await supabase
    .from("shopping_list_template_items")
    .delete()
    .eq("template_id", template.id);
  if (deleteError) throw new Error(deleteError.message);

  const rows = items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      template_id: template.id as string,
      user_id: user.id,
      name: item.name.trim(),
      desired_units: item.desired_units,
    }));
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("shopping_list_template_items").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
};

export const useSaveShoppingTemplate = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: saveTemplate,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useDeleteShoppingTemplate = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async (id: string) => {
      requireOnline();
      const { error } = await supabase.from("shopping_list_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

interface ApplyTemplateResult {
  added: number;
  skipped: number;
}

/** テンプレートのアイテムを買い物リスト（planned）へ一括追加する。既存アイテムは重複追加しない。 */
export const useApplyShoppingTemplate = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation<ApplyTemplateResult, Error, ShoppingTemplateWithItems>({
    mutationFn: async (template) => {
      requireOnline();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: planned, error } = await supabase
        .from("shopping_list_items")
        .select("name")
        .eq("status", "planned");
      if (error) throw new Error(error.message);

      const existingNames = (planned ?? []).map((row) => row.name);
      const newItems = filterNewTemplateItems(template.items, existingNames);
      if (newItems.length === 0) {
        return { added: 0, skipped: template.items.length };
      }

      const rows = newItems.map((item) => ({
        user_id: user.id,
        name: item.name,
        desired_units: item.desired_units,
      }));
      const { error: insertError } = await supabase.from("shopping_list_items").insert(rows);
      if (insertError) throw new Error(insertError.message);

      return { added: newItems.length, skipped: template.items.length - newItems.length };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SHOPPING_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
