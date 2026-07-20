/**
 * 単位換算ユーティリティ（issue #462）。
 *
 * `items.content_unit` は自由記述に近い文字列（固定候補 `CONTENT_UNITS` +
 * カスタム単位 `custom_units`）として保存されており、内部の数量モデル
 * （`units` × `content_amount` + `opened_remaining`）は一切変更しない。
 * ここでは「同一系統の単位（体積: mL/L、重量: g/kg）」間の換算だけを
 * UI 層で行うための純関数を提供する。
 *
 * スコープはあえて体積と重量の2グループに限定する（issue が明記する範囲）。
 * 個数系（個・枚・本・袋）やカスタム単位は換算グループを持たないため、
 * `findUnitGroup` が `undefined` を返し、換算候補は自分自身のみになる。
 */

export type UnitGroupId = "volume" | "weight";

export interface UnitGroup {
  id: UnitGroupId;
  /** そのグループに属する単位 → 基準単位への倍率 */
  factors: Readonly<Record<string, number>>;
}

const UNIT_GROUPS: readonly UnitGroup[] = [
  { id: "volume", factors: { mL: 1, L: 1000 } },
  { id: "weight", factors: { g: 1, kg: 1000 } },
];

/** 指定した単位が属する換算グループを返す。属さない場合は `undefined`。 */
export const findUnitGroup = (unit: string): UnitGroup | undefined =>
  UNIT_GROUPS.find((group) => Object.hasOwn(group.factors, unit));

/** `a` と `b` が同一グループに属し、相互に換算可能かどうか。 */
export const areUnitsConvertible = (a: string, b: string): boolean => {
  if (a === b) return true;
  const group = findUnitGroup(a);
  if (!group) return false;
  return Object.hasOwn(group.factors, b);
};

// DB は content_amount を numeric(12,2) で保持するため、換算結果もそれに
// 合わせて小数2桁に丸め、浮動小数点誤差によるノイズ（例: 0.1 + 0.2）を防ぐ。
export const roundUnitAmount = (n: number): number => Math.round(n * 100) / 100;

/**
 * `amount` (`fromUnit`) を `toUnit` に換算する。
 * 換算不能な組み合わせ（異なるグループ、またはどちらかがグループ外）の場合は
 * `null` を返す — 呼び出し側は「換算せず、そのまま個別単位として扱う」フォールバックを行うこと。
 */
export const convertUnit = (amount: number, fromUnit: string, toUnit: string): number | null => {
  if (fromUnit === toUnit) return roundUnitAmount(amount);
  const group = findUnitGroup(fromUnit);
  if (!group || !Object.hasOwn(group.factors, toUnit)) return null;
  const baseAmount = amount * group.factors[fromUnit]!;
  return roundUnitAmount(baseAmount / group.factors[toUnit]!);
};

/**
 * `unit` と相互換算可能な単位一覧（`unit` 自身を含む）を返す。
 * グループに属さない単位（個数系・カスタム単位）は `[unit]` のみを返す。
 */
export const getConvertibleUnits = (unit: string): string[] => {
  const group = findUnitGroup(unit);
  if (!group) return [unit];
  return Object.keys(group.factors);
};
