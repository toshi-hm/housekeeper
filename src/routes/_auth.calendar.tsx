import { createFileRoute } from "@tanstack/react-router";

import { CalendarPage } from "@/components/pages/CalendarPage";
import { useItemsWithExpiry, useSoftDeleteItem } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";

const CalendarRoutePage = () => {
  const { data: items = [], isLoading } = useItemsWithExpiry();
  const { data: categories = [] } = useCategories();
  const softDelete = useSoftDeleteItem();

  const handleCheck = async (id: string) => {
    await softDelete.mutateAsync(id);
  };

  return (
    <CalendarPage
      items={items}
      categories={categories}
      isLoading={isLoading}
      onCheck={handleCheck}
    />
  );
};

export const Route = createFileRoute("/_auth/calendar")({
  component: CalendarRoutePage,
});
