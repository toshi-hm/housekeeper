/**
 * レシートレビュー画面での店舗別価格上昇アラート（#941）。
 *
 * 統計ページの店舗別価格比較（`computeStorePriceComparisons`, `src/types/stats.ts`,
 * #697）は「2店舗以上のデータがある場合のみ表示」という条件だが、ここでは向きが
 * 逆で「同一商品×同一店舗の組み合わせで2件以上の購入データがある場合のみ判定する」
 * （receipt-scan.md「9. 拡張」節）。商品名は完全一致のみで比較し、表記揺れを
 * 吸収する曖昧マッチは行わない（#990で別途検討するスコープ外）。
 */

/** 価格アラート判定に使う、1件の過去購入ロット行。 */
export interface ReceiptPriceHistoryRow {
  /** ロットの親アイテム名（完全一致比較に使う）。 */
  itemName: string;
  storeName: string | null;
  unitPrice: number | null;
  /** 直近N件の選定に使う日時。購入日が無ければ作成日時にフォールバックする。 */
  purchaseDate: string | null;
  createdAt: string;
}

export interface ReceiptPriceIncreaseAlert {
  /** 直近購入データから算出した基準単価（平均）。 */
  baselinePrice: number;
  /** レビュー行に入力されている現在の単価。 */
  currentPrice: number;
  /** 基準単価に対する上昇率（%、四捨五入）。常に閾値以上の値になる。 */
  increasePercent: number;
}

/** 値上がり判定の閾値。ユーザー設定UIはv1では作らないため固定値（receipt-scan.md「やらないこと」節）。 */
const PRICE_INCREASE_THRESHOLD_RATIO = 0.1;
/** 基準単価の算出に使う直近データの件数上限。 */
const RECENT_HISTORY_LIMIT = 5;

/**
 * 商品名（完全一致）×店舗名で過去ロットを絞り込み、2件以上あれば直近
 * `RECENT_HISTORY_LIMIT` 件の平均単価を基準に、現在の単価がそれより
 * `PRICE_INCREASE_THRESHOLD_RATIO` 以上値上がりしているかを判定する。
 *
 * 以下の場合は null（アラート無し）を返す:
 * - 商品名または店舗名が未入力
 * - 現在の単価が未入力（null）または0以下
 * - 商品名（完全一致）×店舗名の組み合わせで購入データが1件以下
 * - 現在の単価が基準単価から閾値未満の変化（下落・横ばい含む）
 */
export const computeReceiptPriceIncreaseAlert = (
  history: ReceiptPriceHistoryRow[],
  itemName: string,
  storeName: string | null,
  currentUnitPrice: number | null,
): ReceiptPriceIncreaseAlert | null => {
  const normalizedName = itemName.trim();
  const normalizedStore = storeName?.trim() ?? "";
  if (!normalizedName || !normalizedStore) return null;
  if (currentUnitPrice === null || currentUnitPrice <= 0) return null;

  const matching = history.filter(
    (row) =>
      row.itemName === normalizedName &&
      (row.storeName?.trim() ?? "") === normalizedStore &&
      row.unitPrice !== null,
  );
  // 「2件以上のデータがある場合のみ」— #697の店舗別価格比較カードと同じ条件を踏襲。
  if (matching.length < 2) return null;

  const recent = [...matching]
    .sort((a, b) => (b.purchaseDate ?? b.createdAt).localeCompare(a.purchaseDate ?? a.createdAt))
    .slice(0, RECENT_HISTORY_LIMIT);
  const baselinePrice =
    recent.reduce((sum, row) => sum + (row.unitPrice as number), 0) / recent.length;
  if (baselinePrice <= 0) return null;

  const increaseRatio = (currentUnitPrice - baselinePrice) / baselinePrice;
  if (increaseRatio < PRICE_INCREASE_THRESHOLD_RATIO) return null;

  return {
    baselinePrice,
    currentPrice: currentUnitPrice,
    increasePercent: Math.round(increaseRatio * 100),
  };
};
