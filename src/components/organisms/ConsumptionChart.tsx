import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import { useMonthlyConsumption } from "@/hooks/useStats";

export const ConsumptionChart = () => {
  const { t } = useTranslation("stats");
  const data = useMonthlyConsumption(6);

  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
        <p>{t("historyHint")}</p>
      </div>
    );
  }

  const unit = data.find((d) => d.unit)?.unit ?? "";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          unit={unit ? ` ${unit}` : ""}
          width={45}
        />
        <Tooltip
          formatter={(value: number) => [`${value}${unit}`, t("consumptionTrend")]}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};
