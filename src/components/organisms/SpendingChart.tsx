import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthlySpendingEntry } from "@/types/stats";

interface SpendingChartProps {
  data: MonthlySpendingEntry[];
}

export const SpendingChart = ({ data }: SpendingChartProps) => {
  const { t } = useTranslation("stats");

  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
        <p>{t("historyHint")}</p>
      </div>
    );
  }

  const summary = `${t("spendingTrend")}: ${data
    .map((d) => `${d.month} ¥${d.total.toLocaleString()}`)
    .join("、")}`;

  return (
    <div>
      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={data}
            margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
            accessibilityLayer={false}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={45}
              tickFormatter={(value: number) => `¥${value.toLocaleString()}`}
            />
            <Tooltip
              formatter={(value) => [`¥${Number(value ?? 0).toLocaleString()}`, t("spendingTrend")]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar
              dataKey="total"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t("spendingTrend")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("chartMonth")}</th>
            <th scope="col">{t("spendingTrend")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.month}</th>
              <td>¥{d.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
