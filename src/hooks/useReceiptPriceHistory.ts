import { useQuery } from "@tanstack/react-query";

import { LOTS_KEY } from "@/hooks/useItemLots";
import type { ReceiptPriceHistoryRow } from "@/lib/receiptPriceAlert";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePagination";

/** `item_lots` の生ロット行（`items.name` を持たないため、フック側で
 *  現存アイテムの一覧と突き合わせて商品名を解決する）。 */
interface ReceiptPriceLotRow {
  item_id: string;
  store_name: string | null;
  unit_price: number | null;
  purchase_date: string | null;
  created_at: string;
}

interface ItemNameRow {
  id: string;
  name: string;
}

/** レシート価格履歴（#941）の商品名解決専用の軽量一覧。`useItemsForExport`
 *  とは異なり、削除済み(アーカイブ済み)アイテムのロットを基準単価の
 *  計算対象から除外するため `deleted_at IS NULL` でフィルタする(#1023)。 */
const fetchActiveItemNames = async (): Promise<ItemNameRow[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("items")
      .select("id, name")
      .eq("user_id", userData.user.id)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as ItemNameRow[];
  });
};

const useActiveItemNames = () =>
  useQuery({
    queryKey: ["items", "active-name-lookup"],
    queryFn: fetchActiveItemNames,
    staleTime: 60_000,
  });

/** レシートレビュー画面の店舗別価格上昇アラート（#941）用: 店舗名・単価の
 *  両方が記録されているロットのみを対象にする（`useStorePriceComparisons`,
 *  `src/hooks/useStats.ts` と同じフィルタ条件）。 */
const fetchReceiptPriceLots = async (): Promise<ReceiptPriceLotRow[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  // #663と同じ理由でページングする（PostgRESTのデフォルト行数上限対策）。
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("item_lots")
      .select("item_id, store_name, unit_price, purchase_date, created_at")
      .eq("user_id", userData.user.id)
      .not("store_name", "is", null)
      .not("unit_price", "is", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as ReceiptPriceLotRow[];
  });
};

const useReceiptPriceLots = () =>
  useQuery({
    queryKey: [...LOTS_KEY, "receipt-price-history"],
    queryFn: fetchReceiptPriceLots,
    staleTime: 30_000,
  });

/**
 * レシートレビュー画面（`ReceiptReviewPanel`）が各行の値上がり判定に使う、
 * 商品名解決済みの購入価格履歴を返す（receipt-scan.md「9. 拡張」節、#941）。
 *
 * `item_lots` は商品名を持たないため、`items` 側を先に取得して `id -> name`
 * の対応表を作り、ロット行と突き合わせる2段クエリで実装する（同spec
 * 「技術ポイント」節の選択肢のうち後者）。削除済み(アーカイブ済み)アイテムの
 * ロットは基準単価の計算対象から除外する(#1023)ため、`useItemsForExport`
 * ではなく `deleted_at IS NULL` でフィルタする `useActiveItemNames` を使う。
 * `computeReceiptPriceIncreaseAlert`（純粋関数）に渡す前段のデータ取得のみを
 * 担い、値上がり判定そのものはここでは行わない。
 */
export const useReceiptPriceHistory = () => {
  const { data: lots = [], isLoading: lotsLoading, isError: lotsError } = useReceiptPriceLots();
  const { data: items = [], isLoading: itemsLoading, isError: itemsError } = useActiveItemNames();

  const nameById = new Map(items.map((item) => [item.id, item.name]));
  const history: ReceiptPriceHistoryRow[] = [];
  for (const lot of lots) {
    const itemName = nameById.get(lot.item_id);
    if (!itemName) continue; // 削除済みアイテムのロット等、名前解決できない行は対象外
    history.push({
      itemName,
      storeName: lot.store_name,
      unitPrice: lot.unit_price,
      purchaseDate: lot.purchase_date,
      createdAt: lot.created_at,
    });
  }

  return {
    data: history,
    isLoading: lotsLoading || itemsLoading,
    isError: lotsError || itemsError,
  };
};
