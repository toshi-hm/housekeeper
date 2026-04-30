import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";

import { useUserSettings } from "@/hooks/useUserSettings";
import { useExpiryDistribution } from "@/hooks/useStats";

const STATUS_COLORS: Record<string, string> = {
  expired: "#ef4444",
  "expiring-soon": "#f97316",
  ok: "#22c55e",
  unknown: "#94a3b8",
};

export const ExpiryChart = () => {
  const { t } = useTranslation("stats");
  const { t: ti } = useTranslation("items");
  const { data: userSettings } = useUserSettings();
  const distribution = useExpiryDistribution(userSettings?.expiry_warning_days);

  if (distribution.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        {t("noData")}
      </div>
    );
  }

  const data = distribution.map((entry) => ({
    name: ti(`expiryStatus.${entry.status}`),
    value: entry.count,
    status: entry.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          dataKey="value"
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [
            `${value}${t("itemCount")}`,
            name,
          ]}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
};
