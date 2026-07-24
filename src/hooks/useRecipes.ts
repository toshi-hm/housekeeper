import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { consumeItem } from "@/hooks/useConsumeItem";
import { LOTS_KEY } from "@/hooks/useItemLots";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Item } from "@/types/item";
import {
  checkRecipeStock,
  type RecipeFefoLot,
  type RecipeItem,
  type RecipeItemInput,
  type RecipeShortage,
  type RecipeWithItems,
} from "@/types/recipe";

/**
 * レシピの構成アイテムそれぞれについて、`consumeItem` が実際に消費対象とする
 * FEFO ロット（賞味期限が最も近いロット。`consumeItem` と同じ並び順）を1件ずつ
 * 取得する。`checkRecipeStock` の事前チェックを実消費と同じ基準（単一ロット）に
 * 揃えるために使う。
 */
const fetchFefoLotByItemId = async (
  itemIds: string[],
): Promise<Record<string, RecipeFefoLot | undefined>> => {
  if (itemIds.length === 0) return {};

  const { data, error } = await supabase
    .from("item_lots")
    .select("item_id, units, opened_remaining, expiry_date, created_at")
    .in("item_id", itemIds)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const result: Record<string, RecipeFefoLot | undefined> = {};
  for (const lot of data ?? []) {
    // Rows arrive pre-sorted in FEFO order; keep only the first (soonest
    // expiring) lot seen per item.
    if (result[lot.item_id as string]) continue;
    result[lot.item_id as string] = {
      units: lot.units as number,
      opened_remaining: lot.opened_remaining as number | null,
    };
  }
  return result;
};

export const RECIPES_KEY = ["recipes"] as const;

const fetchRecipes = async (): Promise<RecipeWithItems[]> => {
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: items, error: itemsError } = await supabase
    .from("recipe_items")
    .select("*")
    .order("created_at", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const itemsByRecipe = new Map<string, RecipeItem[]>();
  for (const item of (items ?? []) as RecipeItem[]) {
    const list = itemsByRecipe.get(item.recipe_id) ?? [];
    list.push(item);
    itemsByRecipe.set(item.recipe_id, list);
  }

  return (recipes ?? []).map((recipe) => ({
    ...recipe,
    items: itemsByRecipe.get(recipe.id) ?? [],
  })) as RecipeWithItems[];
};

export const useRecipes = () =>
  useQuery({
    queryKey: RECIPES_KEY,
    queryFn: fetchRecipes,
    staleTime: 30_000,
  });

interface SaveRecipeInput {
  id?: string;
  name: string;
  items: RecipeItemInput[];
}

const saveRecipe = async ({ id, name, items }: SaveRecipeInput): Promise<void> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: recipe, error } = await supabase
    .from("recipes")
    .upsert({ id, user_id: user.id, name }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // 構成アイテムは入れ替え方式（既存を削除して挿入し直す）でシンプルに同期する
  // (ShoppingTemplatesPanel の saveTemplate と同じ方針)。
  const { error: deleteError } = await supabase
    .from("recipe_items")
    .delete()
    .eq("recipe_id", recipe.id);
  if (deleteError) throw new Error(deleteError.message);

  const rows = items
    .filter((item) => item.item_id && item.amount > 0)
    .map((item) => ({
      recipe_id: recipe.id as string,
      item_id: item.item_id,
      amount: item.amount,
    }));
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("recipe_items").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
};

export const useSaveRecipe = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: saveRecipe,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useDeleteRecipe = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async (id: string) => {
      requireOnline();
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export interface ExecuteRecipeResult {
  /** "blocked" = 在庫不足があり、force なしで呼ばれたため何も消費していない。
   *  呼び出し側は shortages を見せて確認を取ってから force:true で再実行する。 */
  status: "blocked" | "executed";
  consumedItemIds: string[];
  /** force:true で実行したが在庫不足のため消費をスキップしたアイテム */
  skippedItemIds: string[];
  /** 在庫は足りていたが消費処理自体が失敗した(排他制御の競合など)アイテム */
  failedItemIds: string[];
  shortages: RecipeShortage[];
  /** いずれかのアイテムで消費は成功したが consumption_logs の insert に失敗した */
  logInsertFailed: boolean;
}

interface ExecuteRecipeParams {
  recipe: RecipeWithItems;
  /** id をキーにした対象アイテムのマップ（在庫確認・消費両方に使う） */
  itemsById: Record<string, Item | undefined>;
  /** true の場合、在庫不足があっても足りているアイテムだけ消費を実行する */
  force?: boolean;
}

/**
 * レシピの構成アイテムを一括消費する。
 *
 * 1. まず全構成アイテムの在庫を確認する (checkRecipeStock)。
 * 2. 不足があり force が指定されていなければ、何も消費せず status: "blocked" を返す。
 *    呼び出し側はこれを見て警告ダイアログを表示し、ユーザーが確認したら
 *    force: true で再実行する。
 * 3. force が指定されている場合、在庫が足りるアイテムだけ順に消費する
 *    (existing consumeItem — FEFOロット選択 + 楽観的排他制御を再利用)。
 *    在庫が足りないアイテムはスキップし、消費自体が失敗したアイテムは
 *    failedItemIds に集める（他アイテムの消費は続行するベストエフォート方式）。
 */
export const executeRecipe = async ({
  recipe,
  itemsById,
  force = false,
}: ExecuteRecipeParams): Promise<ExecuteRecipeResult> => {
  const fefoLotByItemId = await fetchFefoLotByItemId(recipe.items.map((ri) => ri.item_id));
  const stockCheck = checkRecipeStock(recipe.items, itemsById, fefoLotByItemId);

  if (!stockCheck.ok && !force) {
    return {
      status: "blocked",
      consumedItemIds: [],
      skippedItemIds: [],
      failedItemIds: [],
      shortages: stockCheck.shortages,
      logInsertFailed: false,
    };
  }

  const shortItemIds = new Set(stockCheck.shortages.map((s) => s.item_id));
  const consumedItemIds: string[] = [];
  const skippedItemIds: string[] = [];
  const failedItemIds: string[] = [];
  let logInsertFailed = false;

  // 1件ずつ順番に処理する（同一アイテムが複数回登場するケースでもロット競合を
  // 起こさず、テストからも呼び出し順を検証しやすいため並列化しない）。
  for (const recipeItem of recipe.items) {
    if (shortItemIds.has(recipeItem.item_id)) {
      skippedItemIds.push(recipeItem.item_id);
      continue;
    }
    const item = itemsById[recipeItem.item_id];
    if (!item) {
      skippedItemIds.push(recipeItem.item_id);
      continue;
    }
    try {
      requireOnline();
      const result = await consumeItem({ item, deltaAmount: recipeItem.amount });
      consumedItemIds.push(recipeItem.item_id);
      if (result._logInsertFailed) logInsertFailed = true;
    } catch {
      failedItemIds.push(recipeItem.item_id);
    }
  }

  return {
    status: "executed",
    consumedItemIds,
    skippedItemIds,
    failedItemIds,
    shortages: stockCheck.shortages,
    logInsertFailed,
  };
};

export const useExecuteRecipe = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: executeRecipe,
    onSuccess: async (result) => {
      if (result.consumedItemIds.length === 0) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
        qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
      ]);
      if (result.logInsertFailed) toast(t("consumptionLogFailed"), "warning");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
