import { createFileRoute } from "@tanstack/react-router";

import { CalendarPage } from "@/components/pages/CalendarPage";
import { useCalendarConsume } from "@/hooks/useCalendarConsume";
import { useItemsWithExpiry } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { useUserSettings } from "@/hooks/useUserSettings";

export { computeCalendarDelta } from "@/types/calendar";

const CalendarRoutePage = () => {
  const { data: items = [], isLoading } = useItemsWithExpiry();
  const { data: categories = [] } = useCategories();
  const { data: userSettings } = useUserSettings();
  const { check, undo, pendingRemovalList } = useCalendarConsume();

  return (
    <CalendarPage
      items={items}
      categories={categories}
      isLoading={isLoading}
      warningDays={userSettings?.expiry_warning_days}
      onCheck={check}
      onUndo={undo}
      pendingRemovals={pendingRemovalList}
    />
  );
};

export const Route = createFileRoute("/_auth/calendar")({
  component: CalendarRoutePage,
});
