import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { CategoryChart } from "@/components/organisms/CategoryChart";
import { ConsumptionChart } from "@/components/organisms/ConsumptionChart";
import { ExpiryChart } from "@/components/organisms/ExpiryChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const StatsPage = () => {
  const { t } = useTranslation("stats");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("categoryBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryChart />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("expiryBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpiryChart />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("consumptionTrend")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("last6Months")}</p>
        </CardHeader>
        <CardContent>
          <ConsumptionChart />
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/stats")({
  component: StatsPage,
});
