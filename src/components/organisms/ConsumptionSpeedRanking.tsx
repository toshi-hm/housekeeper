import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { ConsumptionSpeedRankingEntry } from "@/hooks/useStats";

type TrendBadgeVariant = "warning" | "secondary" | "outline";

const trendVariant = {
  accelerating: "warning",
  decelerating: "secondary",
  steady: "outline",
  "insufficient-data": "outline",
} as const satisfies Record<ConsumptionSpeedRankingEntry["trend"], TrendBadgeVariant>;

const trendLabelKey = {
  accelerating: "trend.accelerating",
  decelerating: "trend.decelerating",
  steady: "trend.steady",
  "insufficient-data": "trend.insufficientData",
} as const satisfies Record<ConsumptionSpeedRankingEntry["trend"], string>;

interface ConsumptionSpeedRankingProps {
  ranking: ConsumptionSpeedRankingEntry[];
  limit?: number;
}

/** 統計ページ用の消費速度ランキング表（#68, #392）。直近の消費ペースが速いアイテム順に並べ、
 * 直前期間との比較で加速中/減速中/横ばいをバッジで示す。 */
export const ConsumptionSpeedRanking = ({ ranking, limit = 8 }: ConsumptionSpeedRankingProps) => {
  const { t } = useTranslation("stats");

  if (ranking.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        {t("noData")}
      </div>
    );
  }

  const visible = ranking.slice(0, limit);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-2 font-medium">{t("itemNameLabel")}</th>
            <th className="py-1.5 pr-2 font-medium">{t("dailyRateLabel")}</th>
            <th className="py-1.5 font-medium">{t("trendLabel")}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <tr key={entry.itemId} className="border-b last:border-0">
              <td className="py-1.5 pr-2">{entry.name}</td>
              <td className="py-1.5 pr-2 tabular-nums">
                {entry.dailyRate} {entry.unit}
              </td>
              <td className="py-1.5">
                <Badge variant={trendVariant[entry.trend]}>{t(trendLabelKey[entry.trend])}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
