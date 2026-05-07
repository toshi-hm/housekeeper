import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { CategoryChart } from "@/components/organisms/CategoryChart";
import { ConsumptionChart } from "@/components/organisms/ConsumptionChart";
import { ExpiryChart } from "@/components/organisms/ExpiryChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryStats, useExpiryDistribution, useMonthlyConsumption } from "@/hooks/useStats";
import { useUserSettings } from "@/hooks/useUserSettings";

const StatsPage = () => {
  const { t } = useTranslation("stats");
  const stats = useCategoryStats();
  const { data: userSettings } = useUserSettings();
  const distribution = useExpiryDistribution(userSettings?.expiry_warning_days);
  const monthlyData = useMonthlyConsumption(6);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("categoryBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryChart stats={stats} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("expiryBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpiryChart distribution={distribution} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("consumptionTrend")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("last6Months")}</p>
        </CardHeader>
        <CardContent>
          <ConsumptionChart data={monthlyData} />
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/stats")({
  component: StatsPage,
});
