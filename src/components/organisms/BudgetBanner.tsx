import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useBudgetStatus } from "@/hooks/useStats";
import type { BudgetStatus, BudgetTier } from "@/types/stats";

const tierBadgeVariant = {
  normal: "secondary",
  caution: "warning",
  over: "destructive",
} as const satisfies Record<BudgetTier, "secondary" | "warning" | "destructive">;

const tierContainerClass = {
  normal: "border-border bg-muted/40 text-foreground",
  caution:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
  over: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100",
} as const satisfies Record<BudgetTier, string>;

const tierLabelKey = {
  normal: "budgetTierNormal",
  caution: "budgetTierCaution",
  over: "budgetTierOver",
} as const satisfies Record<BudgetTier, string>;

interface BudgetBannerViewProps {
  status: BudgetStatus;
}

/**
 * `BudgetBanner` の見た目のみを担う純粋な表示コンポーネント。`status` を直接
 * 受け取るため、Storybook（3段階の配色を網羅表示）や単体テストから状態ごとに
 * 決定的にレンダリングできる。実データ取得（`useBudgetStatus`）は `BudgetBanner`
 * 側が担当する（container/view分離）。
 *
 * しきい値の配色は `ExpiryBadge` と同じ `Badge` variant 規約に揃えている:
 * 80%未満 = secondary（通常）、80%以上 = warning（注意）、100%以上 = destructive（超過）。
 */
export const BudgetBannerView = ({ status }: BudgetBannerViewProps) => {
  const { t } = useTranslation("stats");

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${tierContainerClass[status.tier]}`}
    >
      <Wallet className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{t("budgetBannerMessage", { percent: status.percentUsed })}</p>
          <Badge variant={tierBadgeVariant[status.tier]}>{t(tierLabelKey[status.tier])}</Badge>
        </div>
        <p className="mt-0.5 text-xs opacity-80">
          {t("budgetBannerAmounts", {
            spend: `¥${status.currentSpend.toLocaleString()}`,
            budget: `¥${status.monthlyBudget.toLocaleString()}`,
          })}
        </p>
      </div>
    </div>
  );
};

/**
 * 今月の支出が月次予算（`user_settings.monthly_budget`）に対してどの程度かを表示する
 * ダッシュボード用バナー（#991）。予算未設定のユーザーには一切表示されない
 * （`useBudgetStatus()` が `status: null` を返す間は何もレンダリングしない、
 * `SecurityQuestionReminderBanner` と同じ「条件付き表示・常時マウント」パターン）。
 */
export const BudgetBanner = () => {
  const { status, isLoading } = useBudgetStatus();

  if (isLoading || !status) return null;

  return <BudgetBannerView status={status} />;
};
