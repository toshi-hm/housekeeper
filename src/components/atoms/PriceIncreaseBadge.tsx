import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { ReceiptPriceIncreaseAlert } from "@/lib/receiptPriceAlert";

interface PriceIncreaseBadgeProps {
  /** `computeReceiptPriceIncreaseAlert` の判定結果。null/undefinedなら何も表示しない。 */
  alert: ReceiptPriceIncreaseAlert | null | undefined;
}

/**
 * レシートレビュー行での店舗別価格上昇アラート（#941）。あくまで気づきの
 * 提供のための表示専用バッジで、登録はブロックしない
 * （receipt-scan.md「9. 拡張」節「やらないこと」）。
 *
 * ホバー可否に依存しないよう、詳細説明はカスタムツールチップではなくネイティブ
 * `title` 属性で提供する（`LocationPin` / `VoiceInputButton` と同じ既存パターン）。
 */
export const PriceIncreaseBadge = ({ alert }: PriceIncreaseBadgeProps) => {
  const { t } = useTranslation("receiptScan");
  if (!alert) return null;

  const tooltip = t("priceIncreaseTooltip", {
    percent: alert.increasePercent,
    baseline: Math.round(alert.baselinePrice),
    current: Math.round(alert.currentPrice),
  });

  return (
    <Badge variant="warning" title={tooltip}>
      {t("priceIncreaseBadge", { percent: alert.increasePercent })}
    </Badge>
  );
};
