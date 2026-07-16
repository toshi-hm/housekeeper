import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { upsertItemInListCache } from "@/lib/itemCache";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Item, ItemFilters, ItemFormValues, ItemSortKey } from "@/types/item";

export type { ItemFilters, ItemSortKey };

const ITEMS_KEY = ["items"] as const;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const likePatternToRegExp = (value: string) => {
  const escaped = escapeRegExp(value);
  const pattern = escaped.replaceAll("%", ".*").replaceAll("_", ".");
  return new RegExp(pattern, "i");
};

const matchesSearch = (value: string | null | undefined, search: string): boolean => {
  return likePatternToRegExp(`%${search}%`).test(value ?? "");
};

const matchesItemFilters = (item: Item, filters: ItemFilters): boolean => {
  if (item.deleted_at) return false;
  if (filters.categoryId && item.category_id !== filters.categoryId) return false;
  if (filters.storageLocationId && item.storage_location_id !== filters.storageLocationId)
    return false;
  if (
    filters.search &&
    !matchesSearch(item.name, filters.search) &&
    !matchesSearch(item.barcode, filters.search)
  ) {
    return false;
  }
  return true;
};

/**
 * PostgREST の `.or()` フィルタ構文で予約されている文字（`,` `(` `)`）を含む検索語でも
 * 安全に渡せるよう、値をダブルクォートで囲みエスケープする。
 * （`\` と `"` はダブルクォート内で意味を持つためエスケープが必要）
 */
export const escapeOrFilterValue = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const buildNameOrBarcodeSearchFilter = (search: string): string => {
  const escaped = escapeOrFilterValue(search);
  return `name.ilike."%${escaped}%",barcode.ilike."%${escaped}%"`;
};

const fetchItems = async (
  filters: ItemFilters = {},
  sort: ItemSortKey = "created_at",
): Promise<Item[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  let query = supabase
    .from("items")
    .select("*")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null);

  if (filters.search) {
    query = query.or(buildNameOrBarcodeSearchFilter(filters.search));
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

export const fetchItem = async (id: string): Promise<Item> => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as Item;
};

const normalizeCreateValues = (values: ItemFormValues) => ({
  name: values.name,
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
  minimum_stock:
    values.minimum_stock !== undefined && values.minimum_stock !== null
      ? values.minimum_stock
      : null,
});

const hasOwn = <K extends PropertyKey>(obj: object, key: K): obj is Record<K, unknown> =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const normalizeUpdateValues = (values: Partial<ItemFormValues>) => {
  const normalized: Record<string, unknown> = {};

  if (hasOwn(values, "name") && values.name !== undefined) normalized.name = values.name;

  if (hasOwn(values, "barcode")) normalized.barcode = values.barcode || null;
  if (hasOwn(values, "category_id")) normalized.category_id = values.category_id || null;
  if (hasOwn(values, "storage_location_id")) {
    normalized.storage_location_id = values.storage_location_id || null;
  }

  if (hasOwn(values, "units") && values.units !== undefined) normalized.units = values.units;
  if (hasOwn(values, "content_amount") && values.content_amount !== undefined) {
    normalized.content_amount = values.content_amount;
  }
  if (hasOwn(values, "content_unit") && values.content_unit !== undefined) {
    normalized.content_unit = values.content_unit;
  }
  if (hasOwn(values, "opened_remaining") && values.opened_remaining !== undefined) {
    normalized.opened_remaining = values.opened_remaining;
  }

  if (hasOwn(values, "purchase_date")) normalized.purchase_date = values.purchase_date || null;
  if (hasOwn(values, "expiry_date")) normalized.expiry_date = values.expiry_date || null;
  if (hasOwn(values, "notes")) normalized.notes = values.notes || null;
  if (hasOwn(values, "image_path")) normalized.image_path = values.image_path || null;
  if (hasOwn(values, "minimum_stock")) {
    normalized.minimum_stock =
      values.minimum_stock !== undefined && values.minimum_stock !== null
        ? values.minimum_stock
        : null;
  }

  return normalized;
};

/**
 * バーコードが一致するアクティブなアイテムを探す。
 * 見つかった場合は新規ロットを追加してそのアイテムを返す。なければ null。
 */
export const tryStackToActiveItem = async (
  barcode: string,
  values: ItemFormValues,
  userId: string,
): Promise<Item | null> => {
  const { data, error: findError } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (!data) return null;

  const item = data as Item;
  await createLot(userId, item.id, {
    units: values.units ?? 1,
    opened_remaining: values.opened_remaining ?? null,
    purchase_date: values.purchase_date || null,
    expiry_date: values.expiry_date || null,
  });
  await syncItemAggregate(item.id);

  const { data: updated, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", item.id)
    .single();
  if (error) throw error;
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
  const { data, error: findError } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("barcode", barcode)
    .not("deleted_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
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

interface CreateItemInput {
  values: ItemFormValues;
  forceNew?: boolean;
}

const createItem = async ({
  values,
  forceNew = false,
}: CreateItemInput): Promise<Item & { _revived?: boolean; _stacked?: boolean }> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  if (values.barcode) {
    if (!forceNew) {
      const stacked = await tryStackToActiveItem(values.barcode, values, userData.user.id);
      if (stacked) return { ...stacked, _stacked: true };
    }

    const revived = await tryReviveItem(values.barcode, values, userData.user.id);
    if (revived) return { ...revived, _revived: true };
  }

  const normalized = normalizeCreateValues(values);
  const { data, error } = await supabase
    .from("items")
    .insert({ ...normalized, user_id: userData.user.id })
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
    .update({ ...normalizeUpdateValues(values), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Item;
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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userData.user.id)
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
  return useMutation<Item & { _revived?: boolean; _stacked?: boolean }, Error, CreateItemInput>({
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
      else toast(t("common:unknownError"), "error");
    },
  });
};

export const useUpdateItem = (id: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: (values: Partial<ItemFormValues>) => updateItem(id, values),
    onSuccess: async (updatedItem) => {
      qc.setQueryData<Item>([...ITEMS_KEY, updatedItem.id], updatedItem);

      const listQueries = qc.getQueriesData<Item[]>({ queryKey: ITEMS_KEY });
      for (const [queryKey, cachedItems] of listQueries) {
        if (!Array.isArray(cachedItems) || !Array.isArray(queryKey)) continue;
        const [, rawFilters, rawSort] = queryKey;
        const sort =
          rawSort === "expiry_date" || rawSort === "purchase_date" ? rawSort : "created_at";

        if (rawFilters === "with-expiry") {
          const next =
            !updatedItem.deleted_at && updatedItem.expiry_date
              ? upsertItemInListCache(cachedItems, updatedItem, "expiry_date")
              : cachedItems.filter((item) => item.id !== updatedItem.id);
          qc.setQueryData(queryKey, next);
          continue;
        }

        const filters =
          rawFilters && typeof rawFilters === "object"
            ? (rawFilters as ItemFilters)
            : ({} as ItemFilters);

        if (matchesItemFilters(updatedItem, filters)) {
          qc.setQueryData(queryKey, upsertItemInListCache(cachedItems, updatedItem, sort));
        } else {
          qc.setQueryData(
            queryKey,
            cachedItems.filter((item) => item.id !== updatedItem.id),
          );
        }
      }

      await qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
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

// --- Bulk operations (#359) ---

/** 複数アイテムの保管場所 / カテゴリを一括更新する。 */
const bulkUpdateItems = async (
  ids: string[],
  values: Pick<Partial<ItemFormValues>, "category_id" | "storage_location_id">,
): Promise<void> => {
  requireOnline();
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("items")
    .update({ ...normalizeUpdateValues(values), updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
};

/** 複数アイテムをソフトデリートする。 */
const bulkSoftDeleteItems = async (ids: string[]): Promise<void> => {
  requireOnline();
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
};

/** 複数アイテムを全消費（units=0）にする。ロットを削除して在庫を 0 にリセットする。 */
const bulkConsumeItems = async (ids: string[]): Promise<void> => {
  requireOnline();
  if (ids.length === 0) return;
  const { error: lotError } = await supabase.from("item_lots").delete().in("item_id", ids);
  if (lotError) throw lotError;
  const { error } = await supabase
    .from("items")
    .update({
      units: 0,
      opened_remaining: null,
      expiry_date: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
};

export type BulkAction = "updateLocation" | "updateCategory" | "consume" | "delete";

interface BulkActionInput {
  action: BulkAction;
  ids: string[];
  /** updateLocation / updateCategory のときの対象ID（null = 未設定にする） */
  targetId?: string | null;
}

export const useBulkItemAction = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["common", "items"]);
  return useMutation({
    mutationFn: async ({ action, ids, targetId = null }: BulkActionInput) => {
      switch (action) {
        case "updateLocation":
          await bulkUpdateItems(ids, { storage_location_id: targetId });
          break;
        case "updateCategory":
          await bulkUpdateItems(ids, { category_id: targetId });
          break;
        case "consume":
          await bulkConsumeItems(ids);
          break;
        case "delete":
          await bulkSoftDeleteItems(ids);
          break;
      }
      return { action, count: ids.length };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" }),
        qc.invalidateQueries({ queryKey: LOTS_KEY, refetchType: "all" }),
      ]);
      toast(t("items:bulkActionSuccess"), "success");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("common:offlineError"), "error");
      else toast(t("common:unknownError"), "error");
    },
  });
};
