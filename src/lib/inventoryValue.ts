/** ロット1件分の在庫総額計算に必要な最小限のフィールド。 */
export interface LotForValue {
  units: number;
  unit_price?: number | null;
}

export interface InventoryValueResult {
  /** 単価が設定されているロットの合計金額（円）。 */
  totalValue: number;
  /** 単価が設定されているロットの合計点数。 */
  pricedUnits: number;
  /** 合計金額 / 合計点数（円未満四捨五入）。表示用の「1個あたり」の目安値。 */
  averageUnitPrice: number;
}

/**
 * アイテム（またはロット群）の在庫総額を計算する。
 *
 * - `unit_price` が `null` / `undefined` のロットは金額不明として計算から除外する
 *   （#342: 既存データへの後方互換。unit_price IS NULL = 未設定）。
 * - 単価が設定されたロットが1つもない場合は `null` を返す（呼び出し側で金額を非表示にする）。
 * - `units <= 0`（使い切り）のロットは在庫が無いため対象外。
 */
export const computeInventoryValue = (lots: LotForValue[]): InventoryValueResult | null => {
  const priced = lots.filter(
    (lot): lot is LotForValue & { unit_price: number } =>
      lot.unit_price !== null && lot.unit_price !== undefined && lot.units > 0,
  );
  if (priced.length === 0) return null;

  const totalValue = priced.reduce((sum, lot) => sum + lot.units * lot.unit_price, 0);
  const pricedUnits = priced.reduce((sum, lot) => sum + lot.units, 0);
  if (pricedUnits === 0) return null;

  return {
    totalValue,
    pricedUnits,
    averageUnitPrice: Math.round(totalValue / pricedUnits),
  };
};
