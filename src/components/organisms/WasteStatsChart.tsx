import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthlyWasteEntry } from "@/types/stats";

const BAR_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#06b6d4", "#8b5cf6"];

interface WasteStatsChartProps {
  data: MonthlyWasteEntry[];
}

/** 月次の廃棄件数（カテゴリ別）を積み上げ棒グラフで表示する（#494 フードロスダッシュボード）。
 *  対象は `deletion_reason = 'expired_waste'` でソフトデリートされたアイテムのみ。
 *  unit_price（#342）が未マージのため、金額換算は行わず件数のみを表示する。 */
export const WasteStatsChart = ({ data }: WasteStatsChartProps) => {
  const { t } = useTranslation("stats");

  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
        <p>{t("historyHint")}</p>
      </div>
    );
  }

  // Category names aren't known ahead of time, so collect every name that
  // appears anywhere in the range and render one stacked series per
  // category, mirroring ConsumptionChart's per-unit series approach.
  const categoryNames = [...new Set(data.flatMap((d) => d.byCategory.map((c) => c.name)))];
  const displayName = (name: string) => (name === "__uncategorized__" ? t("uncategorized") : name);

  const chartData = data.map((d) => {
    const row: Record<string, string | number> = { month: d.month };
    for (const { name, count } of d.byCategory) {
      row[name] = count;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value, name) => [`${value ?? 0}${t("itemCount")}`, displayName(String(name))]}
          contentStyle={{ fontSize: 12 }}
        />
        {categoryNames.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={displayName} />
        )}
        {categoryNames.map((name, index) => (
          <Bar
            key={name}
            dataKey={name}
            name={displayName(name)}
            stackId="waste"
            fill={BAR_COLORS[index % BAR_COLORS.length]}
            radius={index === categoryNames.length - 1 ? [4, 4, 0, 0] : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};
