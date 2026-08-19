import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { upsertShoppingItem } from "@/hooks/useShoppingList";
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

export const saveTemplate = async ({ id, name, items }: SaveTemplateInput): Promise<void> => {
  requireOnline();

  // テンプレート本体の更新とアイテムの入れ替え（削除→挿入）を1つのDB関数呼び出しに
  // まとめ、単一トランザクションとして実行する。途中で失敗しても全体がロールバック
  // され、アイテムが全損することはない。
  const payloadItems = items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({ name: item.name.trim(), desired_units: item.desired_units }));

  const { error } = await supabase.rpc("save_shopping_list_template", {
    p_id: id ?? null,
    p_name: name,
    p_items: payloadItems,
  });
  if (error) throw new Error(error.message);
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

/**
 * `useApplyShoppingTemplate` の実処理。単体テストのため素の関数として切り出している。
 * テンプレートのアイテムを買い物リスト（planned）へ一括追加する。既存アイテムは重複追加しない。
 */
export const applyShoppingTemplate = async (
  template: ShoppingTemplateWithItems,
): Promise<ApplyTemplateResult> => {
  requireOnline();

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

  // #852: 複数行をまとめて1回のinsertで送ると、SELECTとINSERTの間に別経路で
  // 同名アイテムが追加された場合の一意制約違反(23505)を、無関係な行も巻き込んで
  // 全体失敗させてしまう。1件ずつ upsertShoppingItem のリトライロジックを再利用し、
  // 個々の競合は既存行への統合にフォールバックさせる。
  for (const item of newItems) {
    await upsertShoppingItem({ name: item.name, desired_units: item.desired_units });
  }

  return { added: newItems.length, skipped: template.items.length - newItems.length };
};

export const useApplyShoppingTemplate = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation<ApplyTemplateResult, Error, ShoppingTemplateWithItems>({
    mutationFn: applyShoppingTemplate,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SHOPPING_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
