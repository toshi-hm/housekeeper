export interface RemainingFields {
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining: number | null;
}

export const formatTotalRemaining = (item: RemainingFields): string => {
  const { units, content_amount, content_unit, opened_remaining } = item;
  if (units === 0 && opened_remaining === null) return `0${content_unit}`;

  const closedUnits = opened_remaining !== null ? Math.max(units - 1, 0) : units;
  const closedAmount = closedUnits * content_amount;
  const total = closedAmount + (opened_remaining ?? 0);

  if (Number.isInteger(total)) return `${total}${content_unit}`;
  return `${Math.round(total * 100) / 100}${content_unit}`;
};

export const formatExpiryDate = (expiryDate: string | null): string => {
  if (!expiryDate) return "未設定";
  const parts = expiryDate.split("-");
  if (parts.length < 3) return expiryDate;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
};
