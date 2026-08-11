import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { getElapsedDays, isOpenedAlertDue } from "@/types/item";

interface OpenedAlertBadgeProps {
  /** 開封日時（`item.opened_at` / ロット集計値）。未開封なら null/undefined。 */
  openedAt: string | null | undefined;
  /** 開封後使用推奨日数。アイテム個別設定またはカテゴリ既定値を解決した値を渡す
   *  （{@link resolveOpenedAlertThresholdDays}）。未設定なら null/undefined。 */
  thresholdDays: number | null | undefined;
}

/**
 * 開封後の消費期限リマインダー用バッジ（#752）。
 * `ExpiryBadge`（賞味期限/消費期限）とは独立した別枠のセカンダリバッジで、
 * 開封してから推奨使用日数を過ぎている場合にのみ表示される。
 */
export const OpenedAlertBadge = ({ openedAt, thresholdDays }: OpenedAlertBadgeProps) => {
  const { t } = useTranslation("items");
  if (!isOpenedAlertDue(openedAt, thresholdDays)) return null;

  const elapsedDays = getElapsedDays(openedAt);

  return <Badge variant="warning">{t("openedAlertBadge", { days: elapsedDays })}</Badge>;
};
