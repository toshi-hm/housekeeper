import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WeeklyMealPlanner } from "@/components/organisms/WeeklyMealPlanner";

const MealPlanPage = () => {
  const { t } = useTranslation("mealPlan");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>
      <WeeklyMealPlanner />
    </div>
  );
};

export const Route = createFileRoute("/_auth/meal-plan")({
  component: MealPlanPage,
});
