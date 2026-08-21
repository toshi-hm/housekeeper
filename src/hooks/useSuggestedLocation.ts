import { useQuery } from "@tanstack/react-query";

import { escapeIlikeWildcards } from "@/hooks/useItems";
import { supabase } from "@/lib/supabase";

const SUGGESTED_LOCATION_KEY = ["suggested-location"] as const;

export interface SuggestedLocationCandidate {
  /** バーコード一致（完全一致）。指定があれば名前一致より優先する。 */
  barcode?: string | null;
  /** 商品名一致（大文字小文字を無視した完全一致）。barcode 未指定時のみ使う。 */
  name?: string | null;
}

interface SuggestedLocationRow {
  storage_location_id: string | null;
}

/**
 * 過去に登録した同一商品（バーコード一致 or 商品名一致）の直近の
 * `storage_location_id` を返す（#814）。新規テーブルは持たず、`useBarcodeLookup`
 * の DB優先ルックアップと同じ `items` テーブルへの問い合わせを流用する。
 *
 * バーコードが指定されていればバーコード完全一致を優先し、無ければ商品名の
 * 完全一致（大文字小文字無視）にフォールバックする。マッチが無い、保管場所が
 * 未設定、またはユーザー未認証の場合は null を返す（呼び出し側はサジェストを
 * 行わずデフォルト動作にフォールバックする）。
 */
export const fetchSuggestedStorageLocation = async (
  candidate: SuggestedLocationCandidate,
): Promise<string | null> => {
  const trimmedBarcode = candidate.barcode?.trim();
  const trimmedName = candidate.name?.trim();
  if (!trimmedBarcode && !trimmedName) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  let query = supabase
    .from("items")
    .select("storage_location_id")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null)
    .not("storage_location_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  query = trimmedBarcode
    ? query.eq("barcode", trimmedBarcode)
    : query.ilike("name", escapeIlikeWildcards(trimmedName!));

  const { data, error } = await query.maybeSingle<SuggestedLocationRow>();
  if (error || !data?.storage_location_id) return null;
  return data.storage_location_id;
};

/**
 * `fetchSuggestedStorageLocation` の React Query ラッパー。`enabled` が
 * false の間、または barcode/name のどちらも空の間はクエリを発行しない
 * （例: 編集画面では常に `enabled: false` を渡し、余計な問い合わせを避ける）。
 */
export const useSuggestedLocation = (candidate: SuggestedLocationCandidate, enabled: boolean) => {
  const barcode = candidate.barcode?.trim() || undefined;
  const name = barcode ? undefined : candidate.name?.trim() || undefined;

  return useQuery({
    queryKey: [...SUGGESTED_LOCATION_KEY, barcode ?? null, name ?? null],
    queryFn: () => fetchSuggestedStorageLocation({ barcode, name }),
    enabled: enabled && !!(barcode || name),
    staleTime: 30_000,
  });
};
