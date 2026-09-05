import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

interface WasteStreakBadgeProps {
  /** waste_streaks.current_streak_weeks（週次バッチでのみ更新、#925）。0以下では何も表示しない。 */
  currentStreakWeeks: number;
}

/** 統計ページ用の「連続◯週間ロスゼロ」ストリーク表示（#925）。
 *  ストリークが無い（0週）状態はモチベーションにつながらないため、
 *  ExpiryBadge/UsageCountBadgeと同様に何も表示しないニュートラルな状態とする。 */
export const WasteStreakBadge = ({ currentStreakWeeks }: WasteStreakBadgeProps) => {
  const { t } = useTranslation("stats");
  if (currentStreakWeeks <= 0) return null;
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Flame className="h-3 w-3" />
      {t("wasteStreak", { count: currentStreakWeeks })}
    </Badge>
  );
};
