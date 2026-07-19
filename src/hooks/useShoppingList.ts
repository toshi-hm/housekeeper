import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { PURCHASE_HISTORY_KEY } from "@/hooks/usePurchaseHistory";
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShoppingItem[];
    },
    staleTime: 30_000,
  });
};

/**
 * 新規追加しようとしている買い物リスト入力に対して、既存の planned 行の中から
 * 統合すべき重複行を探す。同一 linked_item_id、または同名（前後空白を無視し
 * 大文字小文字を区別しない）の行があれば重複とみなす (#522, #447)。
 */
export const findDuplicatePlannedItem = (
  plannedRows: readonly ShoppingItem[],
  input: Pick<UpsertShoppingItemInput, "name" | "linked_item_id">,
): ShoppingItem | undefined => {
  const normalizedName = input.name.trim().toLowerCase();
  return plannedRows.find(
    (row) =>
      (input.linked_item_id && row.linked_item_id === input.linked_item_id) ||
      row.name.trim().toLowerCase() === normalizedName,
  );
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

      // 新規追加時のみ重複防止チェック: 同一 linked_item_id、または同名（前後空白を無視し
      // 大文字小文字を区別しない）の planned 行が既にあれば新規作成せず desired_units を
      // インクリメントして統合する (#522, #447)
      if (!input.id) {
        const { data: plannedRows, error: plannedError } = await supabase
          .from("shopping_list_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "planned");
        if (plannedError) throw new Error(plannedError.message);

        const duplicate = findDuplicatePlannedItem((plannedRows ?? []) as ShoppingItem[], input);

        if (duplicate) {
          const { data, error } = await supabase
            .from("shopping_list_items")
            .update({
              desired_units: duplicate.desired_units + (input.desired_units ?? 1),
              note: input.note ?? duplicate.note,
              linked_item_id: duplicate.linked_item_id ?? input.linked_item_id ?? null,
            })
            .eq("id", duplicate.id)
            .select()
            .single();
          if (error) throw new Error(error.message);
          return data;
        }
      }

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

/**
 * 「購入済みをクリア」時の処理 (#365)。購入済み行を完全削除する前に
 * shopping_list_archive へコピーし、「いつ何をいくつ買ったか」を履歴として残す。
 * 1) 購入済み行を取得 → 2) アーカイブへ insert → 3) 元の行を delete、の順で実行する。
 * insert に失敗した場合は delete まで到達しないため、履歴を残さず削除してしまう
 * ことはない（DBトランザクションではないが、失敗時の安全側に倒す順序）。
 */
export const archivePurchasedItems = async (): Promise<void> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: purchasedRows, error: fetchError } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "purchased");
  if (fetchError) throw new Error(fetchError.message);

  const rows = (purchasedRows ?? []) as ShoppingItem[];
  if (rows.length > 0) {
    // 同一クリア操作でアーカイブされた行を「同じ日の購入」として扱えるよう、
    // archived_at はクライアントで一度だけ生成して全行に揃える。
    const archivedAt = new Date().toISOString();
    const archiveRows = rows.map((row) => ({
      user_id: user.id,
      name: row.name,
      desired_units: row.desired_units,
      note: row.note,
      archived_at: archivedAt,
    }));
    const { error: archiveError } = await supabase
      .from("shopping_list_archive")
      .insert(archiveRows);
    if (archiveError) throw new Error(archiveError.message);
  }

  const { error: deleteError } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("user_id", user.id)
    .eq("status", "purchased");
  if (deleteError) throw new Error(deleteError.message);
};

export const useDeleteAllPurchasedItems = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: archivePurchasedItems,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: PURCHASE_HISTORY_KEY }),
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

/**
 * ショッピングリストのアイテムを「購入済み」にし、対応する在庫アイテムを
 * 作成/スタック/復活させる。各クエリの `error` を必ず検査し、失敗時は
 * throw して mutation を失敗させることで、重複アイテム作成を防ぐ（#440）。
 */
export const purchaseShoppingItem = async ({
  shoppingItemId,
  itemValues,
}: PurchaseInput): Promise<Item & { _stacked?: boolean; _revived?: boolean }> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fix #447: linked_item_id（「補充」等で元アイテムに紐付けられた行）があれば、
  // バーコード一致より優先して元アイテムへ統合する。バーコード未登録のアイテムでも
  // 別行に分裂せず、正しく元アイテムに戻せるようにする。
  const { data: shoppingRowForLink, error: shoppingRowForLinkError } = await supabase
    .from("shopping_list_items")
    .select("linked_item_id")
    .eq("id", shoppingItemId)
    .maybeSingle();
  if (shoppingRowForLinkError) throw shoppingRowForLinkError;
  const linkedItemId = shoppingRowForLink?.linked_item_id ?? null;

  if (linkedItemId) {
    const { data: linkedActiveItem, error: linkedActiveItemError } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", linkedItemId)
      .is("deleted_at", null)
      .maybeSingle();
    if (linkedActiveItemError) throw linkedActiveItemError;

    if (linkedActiveItem) {
      await createLot(user.id, linkedActiveItem.id, lotValuesFromForm(itemValues));
      await syncItemAggregate(linkedActiveItem.id);
      await markShoppingItemPurchased(shoppingItemId, linkedActiveItem.id);
      return linkedActiveItem as Item;
    }

    const { data: linkedDeletedItem, error: linkedDeletedItemError } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", linkedItemId)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (linkedDeletedItemError) throw linkedDeletedItemError;

    if (linkedDeletedItem) {
      const { data: revivedLinked, error: reviveLinkedError } = await supabase
        .from("items")
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", linkedDeletedItem.id)
        .select()
        .single();
      if (reviveLinkedError) throw reviveLinkedError;
      await createLot(user.id, linkedDeletedItem.id, lotValuesFromForm(itemValues));
      await syncItemAggregate(linkedDeletedItem.id);
      await markShoppingItemPurchased(shoppingItemId, revivedLinked.id);
      return revivedLinked as Item;
    }
    // 元アイテムが見つからない（削除済みでも復元できない等）場合はバーコード/新規作成に fallback
  }

  // Fix #212: バーコードが一致するアクティブなアイテムにスタック
  if (itemValues.barcode) {
    const { data: activeItem, error: activeItemError } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", user.id)
      .eq("barcode", itemValues.barcode)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (activeItemError) throw activeItemError;

    if (activeItem) {
      await createLot(user.id, activeItem.id, lotValuesFromForm(itemValues));
      await syncItemAggregate(activeItem.id);
      await markShoppingItemPurchased(shoppingItemId, activeItem.id);
      // 既存アイテムへのスタック。呼び出し側が画像アップロードで既存画像を
      // 上書きしないよう _stacked を立てる（NewItemPage と同じ規約）。
      return { ...(activeItem as Item), _stacked: true };
    }

    // Fix #212: ソフトデリート済みアイテムを復活
    const { data: deletedItem, error: deletedItemError } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", user.id)
      .eq("barcode", itemValues.barcode)
      .not("deleted_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (deletedItemError) throw deletedItemError;

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
      return { ...(revived as Item), _revived: true };
    }
  }

  // バーコードなし or 既存アイテムなし → 新規作成（冪等化）
  // created_item_id が既に設定されている場合はリトライ: 同じIDでupsert
  const { data: shoppingRow, error: shoppingRowError } = await supabase
    .from("shopping_list_items")
    .select("created_item_id")
    .eq("id", shoppingItemId)
    .maybeSingle();
  if (shoppingRowError) throw shoppingRowError;
  const reservedItemId = shoppingRow?.created_item_id ?? null;
  const newItemId = reservedItemId ?? crypto.randomUUID();

  // アイテム作成前に created_item_id を予約（失敗時のリトライで重複作成を防ぐ）
  if (!reservedItemId) {
    const { error: reserveError } = await supabase
      .from("shopping_list_items")
      .update({ created_item_id: newItemId })
      .eq("id", shoppingItemId);
    if (reserveError) throw reserveError;
  }

  const { data: newItem, error: itemError } = await supabase
    .from("items")
    .upsert(
      {
        id: newItemId,
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
      },
      { onConflict: "id" },
    )
    .select()
    .single();
  if (itemError) throw new Error(itemError.message);

  // Fix #211: ロットが未作成の場合のみ追加（リトライ時の重複を防ぐ）
  const { data: existingLots, error: existingLotsError } = await supabase
    .from("item_lots")
    .select("id")
    .eq("item_id", newItemId)
    .limit(1);
  if (existingLotsError) throw existingLotsError;
  if (!existingLots || existingLots.length === 0) {
    await createLot(user.id, newItem.id, lotValuesFromForm(itemValues));
  }

  await syncItemAggregate(newItem.id);
  await markShoppingItemPurchased(shoppingItemId, newItem.id);

  return newItem as Item;
};

export const usePurchaseShoppingItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: purchaseShoppingItem,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
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
