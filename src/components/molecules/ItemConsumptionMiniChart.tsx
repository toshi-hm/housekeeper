import { useTranslation } from "react-i18next";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import type { ItemConsumptionPace } from "@/types/stats";

interface ItemConsumptionMiniChartProps {
  pace: ItemConsumptionPace;
}

/**
 * アイテム詳細の「消費履歴」タブ用ミニグラフ（issue #327）。
 * 過去数ヶ月の消費量を棒グラフで示し、平均消費ペースと推定残り週数を添える。
 * 純粋な表示コンポーネント（molecule）— データ取得は呼び出し側（organism 以上）で行う。
 */
export const ItemConsumptionMiniChart = ({ pace }: ItemConsumptionMiniChartProps) => {
  const { t } = useTranslation("items");
  const { monthly, averagePerMonth, unit, estimatedWeeksRemaining } = pace;

  const hasData = unit !== null && monthly.some((entry) => entry.totals.length > 0);

  if (!hasData) {
    return (
      <div className="flex h-24 items-center justify-center text-center text-sm text-muted-foreground">
        <p>{t("consumptionPaceInsufficientData")}</p>
      </div>
    );
  }

  const chartData = monthly.map((entry) => ({
    month: entry.month,
    amount: entry.totals.find((total) => total.unit === unit)?.total ?? 0,
  }));

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => [`${value}${unit}`, t("stats:consumptionTrend")]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="amount"
            name={unit}
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span data-testid="average-per-month">
          {t("consumptionPaceAveragePerMonth", { amount: averagePerMonth, unit: unit ?? "" })}
        </span>
        {estimatedWeeksRemaining !== null && (
          <span data-testid="estimated-weeks-remaining">
            {t("consumptionPaceEstimatedWeeks", { weeks: estimatedWeeksRemaining })}
          </span>
        )}
      </div>
    </div>
  );
};
