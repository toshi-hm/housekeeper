import { createFileRoute } from "@tanstack/react-router";

import { CalendarPage } from "@/components/pages/CalendarPage";
import { useCalendarConsume } from "@/hooks/useCalendarConsume";
import { useItemsWithExpiry } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";

export { computeCalendarDelta } from "@/types/calendar";

const CalendarRoutePage = () => {
  const { data: items = [], isLoading } = useItemsWithExpiry();
  const { data: categories = [] } = useCategories();
  const { check, undo, pendingRemovalList } = useCalendarConsume();

  return (
    <CalendarPage
      items={items}
      categories={categories}
      isLoading={isLoading}
      onCheck={check}
      onUndo={undo}
      pendingRemovals={pendingRemovalList}
    />
  );
};

export const Route = createFileRoute("/_auth/calendar")({
  component: CalendarRoutePage,
});
