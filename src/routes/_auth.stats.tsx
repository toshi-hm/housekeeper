import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { CategoryChart } from "@/components/organisms/CategoryChart";
import { CategoryValueChart } from "@/components/organisms/CategoryValueChart";
import { ConsumptionChart } from "@/components/organisms/ConsumptionChart";
import { ConsumptionSpeedRanking } from "@/components/organisms/ConsumptionSpeedRanking";
import { ExpiryChart } from "@/components/organisms/ExpiryChart";
import { WasteStatsChart } from "@/components/organisms/WasteStatsChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCategoryStats,
  useCategoryValueStats,
  useConsumptionSpeedRanking,
  useExpiryDistribution,
  useMonthlyConsumption,
  useWasteStats,
} from "@/hooks/useStats";
import { useUserSettings } from "@/hooks/useUserSettings";

const ChartCard = ({
  title,
  subtitle,
  isLoading,
  isError,
  children,
}: {
  title: string;
  subtitle?: string;
  isLoading: boolean;
  isError: boolean;
  children: React.ReactNode;
}) => {
  const { t: tc } = useTranslation("common");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-[120px] w-full rounded-md" />
            <div className="flex justify-center gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ) : isError ? (
          <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-destructive p-4 text-center text-destructive">
            <p className="text-sm">{tc("unknownError")}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
};

const StatsPage = () => {
  const { t } = useTranslation("stats");
  const { stats, isLoading: categoryLoading, isError: categoryError } = useCategoryStats();
  const {
    stats: valueStats,
    isLoading: categoryValueLoading,
    isError: categoryValueError,
  } = useCategoryValueStats();
  const { data: userSettings } = useUserSettings();
  const {
    distribution,
    isLoading: expiryLoading,
    isError: expiryError,
  } = useExpiryDistribution(userSettings?.expiry_warning_days);
  const {
    data: monthlyData,
    isLoading: monthlyLoading,
    isError: monthlyError,
  } = useMonthlyConsumption(6);
  const {
    ranking: speedRanking,
    isLoading: speedLoading,
    isError: speedError,
  } = useConsumptionSpeedRanking();
  const { data: wasteData, isLoading: wasteLoading, isError: wasteError } = useWasteStats(6);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("categoryBreakdown")}
          isLoading={categoryLoading}
          isError={categoryError}
        >
          <CategoryChart stats={stats} />
        </ChartCard>

        <ChartCard title={t("expiryBreakdown")} isLoading={expiryLoading} isError={expiryError}>
          <ExpiryChart distribution={distribution} />
        </ChartCard>

        <ChartCard
          title={t("categoryValueBreakdown")}
          subtitle={t("categoryValueHint")}
          isLoading={categoryValueLoading}
          isError={categoryValueError}
        >
          <CategoryValueChart stats={valueStats} />
        </ChartCard>
      </div>

      <ChartCard
        title={t("consumptionTrend")}
        subtitle={t("last6Months")}
        isLoading={monthlyLoading}
        isError={monthlyError}
      >
        <ConsumptionChart data={monthlyData} />
      </ChartCard>

      <ChartCard
        title={t("consumptionSpeedRanking")}
        subtitle={t("consumptionSpeedRankingSubtitle")}
        isLoading={speedLoading}
        isError={speedError}
      >
        <ConsumptionSpeedRanking ranking={speedRanking} />
      </ChartCard>

      <ChartCard
        title={t("wasteBreakdown")}
        subtitle={t("last6Months")}
        isLoading={wasteLoading}
        isError={wasteError}
      >
        <WasteStatsChart data={wasteData} />
      </ChartCard>
    </div>
  );
};

export const Route = createFileRoute("/_auth/stats")({
  component: StatsPage,
});
