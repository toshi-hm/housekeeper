import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import { normalizeCreateValues, normalizeUpdateValues } from "@/hooks/useItems";
import { PURCHASE_HISTORY_KEY } from "@/hooks/usePurchaseHistory";
import { ConcurrentUpdateError, OfflineError, requireOnline } from "@/lib/requireOnline";
import { findDuplicatePlannedItem } from "@/lib/shoppingDuplicates";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Item, ItemFormValues } from "@/types/item";
import type {
  PurchaseInput,
  ShoppingItem,
  ShoppingStatus,
  UpsertShoppingItemInput,
} from "@/types/shopping";

export const QUERY_KEY = "shopping";

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

export { findDuplicatePlannedItem } from "@/lib/shoppingDuplicates";

/** #952: desired_units の加算マージで楽観的排他制御が競合し続けた場合に
 *  諦めるまでの最大試行回数。 */
const MAX_MERGE_ATTEMPTS = 3;

/**
 * 新規追加時の重複防止チェック: 同一 linked_item_id、または同名（前後空白を無視し
 * 大文字小文字を区別しない）の planned 行が既にあれば、新規作成せず desired_units を
 * インクリメントして統合する (#522, #447)。見つからなければ null。
 *
 * #952: `desired_units` の加算は「直前に読んだ値」を前提にした絶対値の書き込みの
 * ため、`.eq("desired_units", <直前に読んだ値>)` を条件に付けた楽観的排他制御を行う。
 * 2つの並行マージ（例: bulkConsumeItems が複数アイテムに対して並列発火する
 * maybeAutoReorder）が同じ行を同時に読むと、条件に一致する行が0件になり
 * ロストアップデートを防げる。0件だった場合は最新の行を再取得し、その値を基準に
 * 増分を計算し直してリトライする（23505 競合時のリトライパターンと同様）。
 */
const mergeIntoDuplicatePlannedItem = async (
  userId: string,
  input: UpsertShoppingItemInput,
): Promise<ShoppingItem | null> => {
  const { data: plannedRows, error: plannedError } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "planned");
  if (plannedError) throw new Error(plannedError.message);

  let duplicate = findDuplicatePlannedItem((plannedRows ?? []) as ShoppingItem[], input);
  if (!duplicate) return null;

  for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .update({
        desired_units: duplicate.desired_units + (input.desired_units ?? 1),
        note: input.note ?? duplicate.note,
        linked_item_id: duplicate.linked_item_id ?? input.linked_item_id ?? null,
      })
      .eq("id", duplicate.id)
      .eq("desired_units", duplicate.desired_units)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;

    // desired_units が読み取り時から変わっていた(並行マージがあった)ため、
    // 最新の行を再取得して増分を計算し直す。status="planned"も再度絞り込み、
    // 再取得までの間に行が購入済み等へ遷移していた場合は統合対象から除外する
    // （そうしないと在庫に紐づかない別ステータスの行へ誤って統合してしまう）。
    const { data: refreshed, error: refreshError } = await supabase
      .from("shopping_list_items")
      .select("*")
      .eq("id", duplicate.id)
      .eq("status", "planned")
      .maybeSingle();
    if (refreshError) throw new Error(refreshError.message);
    // 再取得中に行自体が削除された、またはplannedでなくなった(購入/削除された)
    // 場合は統合対象が消えたとみなし、呼び出し元の通常の新規作成/挿入パスに委ねる。
    if (!refreshed) return null;
    duplicate = refreshed as ShoppingItem;
  }

  throw new ConcurrentUpdateError();
};

/** `useUpsertShoppingItem` の実処理。単体テストのため素の関数として切り出している。 */
export const upsertShoppingItem = async (input: UpsertShoppingItemInput) => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!input.id) {
    const merged = await mergeIntoDuplicatePlannedItem(user.id, input);
    if (merged) return merged;
  }

  // 既存行の編集時、呼び出し元が linked_item_id を渡さない（undefined）ケースが
  // 大半のため、その場合は既存値を保持する。明示的に null/値が渡された場合のみ
  // 上書きする (#619: インライン編集で linked_item_id が失われる問題の修正)。
  let linkedItemId = input.linked_item_id;
  if (input.id && linkedItemId === undefined) {
    const { data: existing, error: existingError } = await supabase
      .from("shopping_list_items")
      .select("linked_item_id")
      .eq("id", input.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    linkedItemId = existing?.linked_item_id ?? null;
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
        linked_item_id: linkedItemId ?? null,
      },
      { onConflict: "id" },
    )
    .select()
    .single();
  if (error) {
    // #766: a concurrent request may have inserted/matched a same-name (or
    // same linked_item_id) planned row between our client-side check above
    // and this insert, tripping the DB-level unique constraint
    // (shopping_planned_name_unique / shopping_planned_linked_item_unique).
    // Retry the merge now that the conflicting row actually exists, instead
    // of surfacing a raw constraint-violation error to the user.
    if (!input.id && error.code === "23505") {
      const merged = await mergeIntoDuplicatePlannedItem(user.id, input);
      if (merged) return merged;
    }
    throw new Error(error.message);
  }
  return data;
};

export const useUpsertShoppingItem = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: upsertShoppingItem,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (error) => {
      if (error instanceof OfflineError) {
        toast(t("offlineError"), "error");
      } else if (error instanceof ConcurrentUpdateError) {
        toast(t("lotConflictError"), "error");
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

/**
 * 削除したショッピングリスト行を同じ内容（同じ id を含む）で復元する。
 * shopping_list_items はソフトデリートを持たないため、Undo のたびに
 * 実際に再 insert する（#478）。
 */
export const restoreShoppingItem = async (item: ShoppingItem): Promise<void> => {
  requireOnline();
  const { error } = await supabase.from("shopping_list_items").insert({
    id: item.id,
    user_id: item.user_id,
    name: item.name,
    desired_units: item.desired_units,
    note: item.note,
    linked_item_id: item.linked_item_id,
    status: item.status,
    purchased_at: item.purchased_at,
    created_item_id: item.created_item_id,
  });
  if (error) throw new Error(error.message);
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

/**
 * 既存アイテムへ統合する購入パス（linked_item_id一致 / バーコード一致）で、
 * フォーム入力を items テーブルへ反映するためのフィールド抽出 (#830)。
 *
 * `units`/`content_amount`/`content_unit`/`barcode` 等は含めない —
 * これらはロット（`lotValuesFromForm`）または `syncItemAggregate` が
 * 別途扱う値であり、購入フォームの `units`（今回購入した数量）を
 * そのまま item 側の `units` に書くと在庫数が壊れるため。
 * `normalizeUpdateValues` を使うことで null 正規化のルールを
 * `useItems.ts`（通常の編集パス）と揃える。
 */
const mergeableItemFieldsFromForm = (itemValues: ItemFormValues) =>
  normalizeUpdateValues({
    category_id: itemValues.category_id,
    storage_location_id: itemValues.storage_location_id,
    notes: itemValues.notes,
    minimum_stock: itemValues.minimum_stock,
    auto_reorder: itemValues.auto_reorder,
    reorder_threshold: itemValues.reorder_threshold,
    expiry_type: itemValues.expiry_type,
    image_path: itemValues.image_path,
  });

export const lotValuesFromForm = (itemValues: ItemFormValues) => ({
  units: itemValues.units ?? 1,
  opened_remaining: itemValues.opened_remaining ?? null,
  unit_price: itemValues.unit_price ?? null,
  purchase_date: itemValues.purchase_date || null,
  expiry_date: itemValues.expiry_date || null,
  store_name: itemValues.store_name ?? null,
});

/** Atomically move every purchased row into immutable purchase history. */
export const archivePurchasedItems = async (): Promise<void> => {
  requireOnline();
  const { error } = await supabase.rpc("archive_purchased_shopping_items", {});
  if (error) throw new Error(error.message);
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
 * `purchaseShoppingItem` の既存アイテム統合4パス（linked_item_id一致/バーコード一致 ×
 * アクティブ/削除済み復活）共通の冪等化ガード（#912）。
 *
 * `createLot` が成功した後に、shopping 行の `created_item_id` を対象アイテムへ
 * 予約する（新規作成パスの「ロット作成後に存在チェックする」冪等化パターン、
 * Fix #211 と同様、完了を示すマーカーは作業が終わってから立てる）。
 * `syncItemAggregate`/`markShoppingItemPurchased` がネットワーク瞬断等で失敗
 * すると shopping 行は `planned` のまま残るため、同じ購入操作がリトライされ
 * 得る。その際、直前の試行で既にこの対象アイテムへ予約済み（＝ロット作成まで
 * 完了していた）と分かれば `createLot` をスキップし、在庫ロットの二重作成を
 * 防ぐ。新規作成パス（既存ロット有無チェック、Fix #211）と異なり、統合先
 * アイテムは既存ロットを持ち得るため「ロットの有無」では判定できず、
 * `created_item_id` の予約を目印にする。
 */
const reserveAndCreateLot = async (
  shoppingItemId: string,
  userId: string,
  targetItemId: string,
  alreadyReservedItemId: string | null,
  lot: ReturnType<typeof lotValuesFromForm>,
): Promise<void> => {
  if (alreadyReservedItemId === targetItemId) return;
  await createLot(userId, targetItemId, lot);
  const { error: reserveError } = await supabase
    .from("shopping_list_items")
    .update({ created_item_id: targetItemId })
    .eq("id", shoppingItemId);
  if (reserveError) throw reserveError;
};

/**
 * ショッピングリストのアイテムを「購入済み」にし、対応する在庫アイテムを
 * 作成/スタック/復活させる。各クエリの `error` を必ず検査し、失敗時は
 * throw して mutation を失敗させることで、重複アイテム作成を防ぐ（#440）。
 */
export const purchaseShoppingItem = async ({
  shoppingItemId,
  itemValues,
  applyMergeFields = false,
}: PurchaseInput): Promise<Item & { _stacked?: boolean; _revived?: boolean }> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fix #447: linked_item_id（「補充」等で元アイテムに紐付けられた行）があれば、
  // バーコード一致より優先して元アイテムへ統合する。バーコード未登録のアイテムでも
  // 別行に分裂せず、正しく元アイテムに戻せるようにする。
  // created_item_id も併せて取得し、新規作成パス（Fix #211）と既存アイテム統合
  // パス（#912）の両方でリトライ時の冪等化予約チェックに使う。
  const { data: shoppingRowForLink, error: shoppingRowForLinkError } = await supabase
    .from("shopping_list_items")
    .select("linked_item_id, created_item_id")
    .eq("id", shoppingItemId)
    .maybeSingle();
  if (shoppingRowForLinkError) throw shoppingRowForLinkError;
  const linkedItemId = shoppingRowForLink?.linked_item_id ?? null;
  const reservedItemId = shoppingRowForLink?.created_item_id ?? null;

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
      // #830: フォームで入力されたカテゴリ/保管場所/メモ等を、ロット追加だけでなく
      // 統合先の items 行にも反映する。ただし、フォームが実際にこのアイテムの
      // 既存値でプリフィルされていた場合（`applyMergeFields`）に限る — でなければ
      // 空欄の入力項目をそのまま書き込み、ユーザーに見せていない既存の
      // カテゴリ/保管場所/メモ等を消してしまう（#879セルフレビュー）。
      const updatedLinkedItem = applyMergeFields
        ? await (async () => {
            const { data, error } = await supabase
              .from("items")
              .update({
                ...mergeableItemFieldsFromForm(itemValues),
                updated_at: new Date().toISOString(),
              })
              .eq("id", linkedActiveItem.id)
              .select()
              .single();
            if (error) throw error;
            return data as Item;
          })()
        : linkedActiveItem;
      await reserveAndCreateLot(
        shoppingItemId,
        user.id,
        linkedActiveItem.id,
        reservedItemId,
        lotValuesFromForm(itemValues),
      );
      await syncItemAggregate(linkedActiveItem.id);
      await markShoppingItemPurchased(shoppingItemId, linkedActiveItem.id);
      // 既存アイテムへのスタック。呼び出し側が画像アップロードで既存画像を
      // 上書きしないよう _stacked を立てる（バーコード一致経路と同じ規約、#894）。
      return { ...(updatedLinkedItem as Item), _stacked: true };
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
      // このパスはフォームがプリフィルされない（#879セルフレビュー、
      // PurchaseInput.applyMergeFields のコメント参照）ため、items 側の
      // フィールドは復活(deleted_at解除)のみで、フォーム入力は反映しない。
      const { data: revivedLinked, error: reviveLinkedError } = await supabase
        .from("items")
        .update({
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkedDeletedItem.id)
        .select()
        .single();
      if (reviveLinkedError) throw reviveLinkedError;
      await reserveAndCreateLot(
        shoppingItemId,
        user.id,
        linkedDeletedItem.id,
        reservedItemId,
        lotValuesFromForm(itemValues),
      );
      await syncItemAggregate(linkedDeletedItem.id);
      await markShoppingItemPurchased(shoppingItemId, revivedLinked.id);
      // 既存アイテムの復活。呼び出し側が画像アップロードで既存画像を
      // 上書きしないよう _revived を立てる（バーコード一致経路と同じ規約、#894）。
      return { ...(revivedLinked as Item), _revived: true };
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
      // バーコード一致は購入完了時にしか対象アイテムが判明せず、フォームは
      // プリフィルされない（#879セルフレビュー）ため、items 側のフィールド
      // は反映しない。ロット追加・集計のみ行う。
      await reserveAndCreateLot(
        shoppingItemId,
        user.id,
        activeItem.id,
        reservedItemId,
        lotValuesFromForm(itemValues),
      );
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
      // バーコード一致による復活も購入完了時にしか対象が判明せずプリフィル
      // されない（#879セルフレビュー）ため、items 側は復活のみでフォーム
      // 入力は反映しない。
      const { data: revived, error: reviveError } = await supabase
        .from("items")
        .update({
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deletedItem.id)
        .select()
        .single();
      if (reviveError) throw reviveError;
      await reserveAndCreateLot(
        shoppingItemId,
        user.id,
        deletedItem.id,
        reservedItemId,
        lotValuesFromForm(itemValues),
      );
      await syncItemAggregate(deletedItem.id);
      await markShoppingItemPurchased(shoppingItemId, revived.id);
      return { ...(revived as Item), _revived: true };
    }
  }

  // バーコードなし or 既存アイテムなし → 新規作成（冪等化）
  // created_item_id が既に設定されている場合はリトライ: 同じIDでupsert
  // （reservedItemId は冒頭の shoppingRowForLink 取得で既に読み込み済み）
  const newItemId = reservedItemId ?? crypto.randomUUID();

  // アイテム作成前に created_item_id を予約（失敗時のリトライで重複作成を防ぐ）
  if (!reservedItemId) {
    const { error: reserveError } = await supabase
      .from("shopping_list_items")
      .update({ created_item_id: newItemId })
      .eq("id", shoppingItemId);
    if (reserveError) throw reserveError;
  }

  // #732: reuse the same field list as the normal creation path
  // (useItems.ts's createItem) so expiry_type / minimum_stock / auto_reorder /
  // reorder_threshold / pin position etc. aren't silently dropped just
  // because the item happened to be created via the shopping list purchase
  // flow instead of NewItemPage.
  const { data: newItem, error: itemError } = await supabase
    .from("items")
    .upsert(
      { ...normalizeCreateValues(itemValues), id: newItemId, user_id: user.id },
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
