import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

interface UsageCountBadgeProps {
  /** アイテムから参照されている件数。0以下の場合は何も表示しない。 */
  count: number;
}

/** カテゴリ/保管場所などマスタデータの使用中件数を示すバッジ（#863）。
 *  一覧表示の時点で「削除できるかどうか」を事前に示すためのUIヒントで、
 *  削除実行の可否判定そのものはサーバー側（RPC）で行う。 */
export const UsageCountBadge = ({ count }: UsageCountBadgeProps) => {
  const { t } = useTranslation("common");
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="shrink-0 font-normal">
      {t("usedByCount", { count })}
    </Badge>
  );
};
