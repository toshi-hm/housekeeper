import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { maybeAutoReorder } from "@/lib/autoReorder";
import { upsertItemInListCache } from "@/lib/itemCache";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import {
  getLotRemainingAmount,
  type Item,
  type ItemDeletionReason,
  type ItemFilters,
  type ItemFormValues,
  type ItemSortKey,
  roundFloat,
} from "@/types/item";

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
  auto_reorder: values.auto_reorder ?? false,
  reorder_threshold:
    values.reorder_threshold !== undefined && values.reorder_threshold !== null
      ? values.reorder_threshold
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
  if (hasOwn(values, "auto_reorder") && values.auto_reorder !== undefined) {
    normalized.auto_reorder = values.auto_reorder;
  }
  if (hasOwn(values, "reorder_threshold")) {
    normalized.reorder_threshold =
      values.reorder_threshold !== undefined && values.reorder_threshold !== null
        ? values.reorder_threshold
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
    unit_price: values.unit_price ?? null,
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
    unit_price: values.unit_price ?? null,
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

export const createItem = async ({
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

      const revived = await tryReviveItem(values.barcode, values, userData.user.id);
      if (revived) return { ...revived, _revived: true };
    }
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
    unit_price: values.unit_price ?? null,
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

interface SoftDeleteItemInput {
  id: string;
  /** #494: 未指定の場合は理由なしでソフトデリートする（後方互換）。 */
  reason?: ItemDeletionReason;
}

const softDeleteItem = async ({ id, reason }: SoftDeleteItemInput): Promise<void> => {
  requireOnline();
  const { error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString(), deletion_reason: reason ?? null })
    .eq("id", id);
  if (error) throw error;
};

/** 棚卸し（在庫確認）: `last_verified_at` を現在時刻で更新する (#375) */
const verifyItem = async (id: string): Promise<Item> => {
  requireOnline();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("items")
    .update({ last_verified_at: now, updated_at: now })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Item;
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

/** カレンダー用: expiry_date を持つアクティブアイテムのみ返す。
 *  自動アーカイブ (#419) の対象走査にも流用する（deleted_at is null なアイテムだけを見れば十分）。 */
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

/**
 * `ITEMS_KEY` にマッチする全てのキャッシュ済みリストに対し、`item` をそのリストの
 * フィルタ条件（category / storageLocation / search、`with-expiry` 種別）に基づいて
 * 反映する。一致しないリストには一切書き込まない（#435: フィルタ無視によるチラつき対策）。
 *
 * - 一致する → upsert（新規追加 or 更新）
 * - 元々キャッシュに存在していたが一致しなくなった → 除外
 * - 元々存在せず、かつ一致しない → 何もしない（新規作成時の誤挿入を防ぐ）
 */
export const applyItemToListCaches = (qc: QueryClient, item: Item) => {
  const listQueries = qc.getQueriesData<Item[]>({ queryKey: ITEMS_KEY });
  for (const [queryKey, cachedItems] of listQueries) {
    if (!Array.isArray(cachedItems) || !Array.isArray(queryKey)) continue;
    const [, rawFilters, rawSort] = queryKey;
    const sort = rawSort === "expiry_date" || rawSort === "purchase_date" ? rawSort : "created_at";

    if (rawFilters === "with-expiry") {
      const next =
        !item.deleted_at && item.expiry_date
          ? upsertItemInListCache(cachedItems, item, "expiry_date")
          : cachedItems.filter((cached) => cached.id !== item.id);
      qc.setQueryData(queryKey, next);
      continue;
    }

    // アーカイブ済み一覧 (#419) は deleted_at 昇順ではなく降順ソートかつ「削除済みのみ」が
    // 対象なので、通常フィルタ判定を通さず専用ロジックで扱う。
    if (rawFilters === "deleted") {
      const next = item.deleted_at
        ? upsertItemInListCache(cachedItems, item, "created_at")
        : cachedItems.filter((cached) => cached.id !== item.id);
      qc.setQueryData(queryKey, next);
      continue;
    }

    const filters =
      rawFilters && typeof rawFilters === "object"
        ? (rawFilters as ItemFilters)
        : ({} as ItemFilters);

    if (matchesItemFilters(item, filters)) {
      qc.setQueryData(queryKey, upsertItemInListCache(cachedItems, item, sort));
    } else if (cachedItems.some((cached) => cached.id === item.id)) {
      qc.setQueryData(
        queryKey,
        cachedItems.filter((cached) => cached.id !== item.id),
      );
    }
  }
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

      applyItemToListCaches(qc, result);
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
      applyItemToListCaches(qc, updatedItem);

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

/** データエクスポート（#381）の履歴 CSV でアイテム名/カテゴリ/メモを解決するための
 *  軽量な一覧。`useItems` と異なり `deleted_at` でフィルタしない
 *  （過去に削除済みのアイテムの履歴行も名前を表示できるようにするため）。 */
interface ItemLookupForExport {
  id: string;
  name: string;
  category_id: string | null;
  notes: string | null;
  content_unit: string;
}

const fetchItemsForExport = async (): Promise<ItemLookupForExport[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("items")
    .select("id, name, category_id, notes, content_unit")
    .eq("user_id", userData.user.id);
  if (error) throw error;
  return (data ?? []) as ItemLookupForExport[];
};

export const useItemsForExport = () =>
  useQuery({
    queryKey: [...ITEMS_KEY, "export-lookup"],
    queryFn: fetchItemsForExport,
    staleTime: 60_000,
  });

export const useVerifyItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["common", "items"]);
  return useMutation({
    mutationFn: verifyItem,
    onSuccess: (updatedItem) => {
      qc.setQueryData<Item>([...ITEMS_KEY, updatedItem.id], updatedItem);
      applyItemToListCaches(qc, updatedItem);
      toast(t("items:verifySuccess"), "success");
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

// --- Archived (soft-deleted) items view & restore (#419) ---

const DELETED_ITEMS_KEY = ["items", "deleted"] as const;

/** ソフトデリート済みアイテムを一覧取得する（アーカイブ済み一覧・復元UI用）。 */
const fetchDeletedItems = async (): Promise<Item[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userData.user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Item[];
};

export const useDeletedItems = () =>
  useQuery({
    queryKey: DELETED_ITEMS_KEY,
    queryFn: fetchDeletedItems,
    staleTime: 30_000,
  });

const restoreItem = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase
    .from("items")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
};

export const useRestoreItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["common", "settings"]);
  return useMutation({
    mutationFn: restoreItem,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" }),
        qc.invalidateQueries({ queryKey: DELETED_ITEMS_KEY, refetchType: "all" }),
      ]);
      toast(t("settings:restoreSuccess"), "success");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("common:offlineError"), "error");
      else toast(t("common:unknownError"), "error");
    },
  });
};

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
const bulkSoftDeleteItems = async (ids: string[], reason?: ItemDeletionReason): Promise<void> => {
  requireOnline();
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString(), deletion_reason: reason ?? null })
    .in("id", ids);
  if (error) throw error;
};

/** 複数アイテムを全消費（units=0）にする。ロットを削除して在庫を 0 にリセットする。
 *  削除対象ロットごとに consumption_logs へ記録してから削除する（#541）。 */
export const bulkConsumeItems = async (ids: string[]): Promise<void> => {
  requireOnline();
  if (ids.length === 0) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const [{ data: lots, error: lotsFetchError }, { data: itemsRows, error: itemsFetchError }] =
    await Promise.all([
      supabase.from("item_lots").select("id, item_id, units, opened_remaining").in("item_id", ids),
      supabase.from("items").select("id, content_amount, content_unit").in("id", ids),
    ]);
  if (lotsFetchError) throw lotsFetchError;
  if (itemsFetchError) throw itemsFetchError;

  const itemMap = new Map(
    (itemsRows ?? []).map((i) => [
      i.id as string,
      i as { content_amount: number; content_unit: string },
    ]),
  );

  const logRows = (lots ?? [])
    .map((lot) => {
      const units = lot.units as number;
      const openedRemaining = lot.opened_remaining as number | null;
      const item = itemMap.get(lot.item_id as string);
      const contentAmount = item?.content_amount ?? 1;
      const deltaAmount = roundFloat(getLotRemainingAmount(units, contentAmount, openedRemaining));
      return {
        user_id: userData.user.id,
        item_id: lot.item_id,
        delta_amount: deltaAmount,
        delta_unit: item?.content_unit ?? "個",
        units_before: units,
        units_after: 0,
        opened_remaining_before: openedRemaining,
        opened_remaining_after: null,
      };
    })
    .filter((row) => row.delta_amount > 0);

  if (logRows.length > 0) {
    const { error: logError } = await supabase.from("consumption_logs").insert(logRows);
    if (logError) {
      // Non-fatal: stock is still reset below. Log for debugging (#441).
      // oxlint-disable-next-line no-console
      console.warn("bulkConsumeItems: consumption_logs insert failed", logError);
    }
  }

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

  // 全消費（units=0）後、auto_reorder が有効なアイテムは買い物リストへ自動追加する (#353)。
  await Promise.all(ids.map((id) => maybeAutoReorder(id)));
};

export type BulkAction = "updateLocation" | "updateCategory" | "consume" | "delete";

interface BulkActionInput {
  action: BulkAction;
  ids: string[];
  /** updateLocation / updateCategory のときの対象ID（null = 未設定にする） */
  targetId?: string | null;
  /** delete のときの削除理由（#494） */
  reason?: ItemDeletionReason;
}

export const useBulkItemAction = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["common", "items"]);
  return useMutation({
    mutationFn: async ({ action, ids, targetId = null, reason }: BulkActionInput) => {
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
          await bulkSoftDeleteItems(ids, reason);
          break;
      }
      return { action, count: ids.length };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" }),
        qc.invalidateQueries({ queryKey: LOTS_KEY, refetchType: "all" }),
        // bulkConsumeItems の auto_reorder トリガーで shopping_list_items が
        // 更新されることがあるため、買い物リストのキャッシュも更新する (#353)。
        qc.invalidateQueries({ queryKey: ["shopping"] }),
      ]);
      toast(t("items:bulkActionSuccess"), "success");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("common:offlineError"), "error");
      else toast(t("common:unknownError"), "error");
    },
  });
};
