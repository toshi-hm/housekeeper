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

import type { MonthlyConsumptionEntry } from "@/types/stats";

const BAR_COLORS = ["hsl(var(--primary))", "#f97316", "#22c55e", "#ec4899", "#6366f1", "#eab308"];

interface ConsumptionChartProps {
  data: MonthlyConsumptionEntry[];
}

export const ConsumptionChart = ({ data }: ConsumptionChartProps) => {
  const { t } = useTranslation("stats");

  const hasData = data.some((d) => d.totals.some((u) => u.total > 0));

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
        <p>{t("historyHint")}</p>
      </div>
    );
  }

  // Units aren't known ahead of time and can differ month to month (e.g.
  // "g" one month, "個" the next), so collect every unit that appears
  // anywhere in the range and render one series per unit instead of
  // assuming a single unit for the whole chart.
  const units = [...new Set(data.flatMap((d) => d.totals.map((u) => u.unit)))];

  const chartData = data.map((d) => {
    const row: Record<string, string | number> = { month: d.month };
    for (const { unit, total } of d.totals) {
      row[unit] = total;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
        <Tooltip
          formatter={(value, name) => [`${value ?? 0}${name}`, t("consumptionTrend")]}
          contentStyle={{ fontSize: 12 }}
        />
        {units.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {units.map((unit, index) => (
          <Bar
            key={unit}
            dataKey={unit}
            name={unit}
            stackId="consumption"
            fill={BAR_COLORS[index % BAR_COLORS.length]}
            radius={index === units.length - 1 ? [4, 4, 0, 0] : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};
