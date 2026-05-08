import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ExpiryCheckItem } from "@/components/molecules/ExpiryCheckItem";
import { ExpiryCalendar } from "@/components/organisms/ExpiryCalendar";
import { useItemsWithExpiry, useSoftDeleteItem } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import type { Item } from "@/types/item";

const CalendarPage = () => {
  const { t } = useTranslation("calendar");
  const { data: items = [], isLoading } = useItemsWithExpiry();
  const { data: categories = [] } = useCategories();
  const softDelete = useSoftDeleteItem();

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekLater = new Date(today);
  weekLater.setDate(today.getDate() + 7);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const expired: Item[] = [];
  const thisWeek: Item[] = [];
  const thisMonth: Item[] = [];

  for (const item of items) {
    if (!item.expiry_date) continue;
    const [y, m, d] = item.expiry_date.split("-").map(Number) as [number, number, number];
    const exp = new Date(y, m - 1, d);

    if (exp < today) {
      expired.push(item);
    } else if (exp <= weekLater) {
      thisWeek.push(item);
    } else if (exp <= monthEnd) {
      thisMonth.push(item);
    }
  }

  const handleCheck = async (id: string) => {
    await softDelete.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">{t("noItems")}</p>
          <p className="mt-1 text-xs">{t("noItemsHint")}</p>
        </div>
      )}

      {/* Summary section */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left column: expired + this week */}
        <div className="space-y-3">
          {/* Expired */}
          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold text-destructive">{t("expired")}</h2>
            {expired.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noExpired")}</p>
            ) : (
              <div>
                {expired.map((item) => (
                  <ExpiryCheckItem
                    key={item.id}
                    item={item}
                    categoryColor={
                      item.category_id ? (categoryMap.get(item.category_id)?.color ?? null) : null
                    }
                    onCheck={handleCheck}
                  />
                ))}
              </div>
            )}
          </div>

          {/* This week */}
          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold text-yellow-600">{t("thisWeek")}</h2>
            {thisWeek.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noThisWeek")}</p>
            ) : (
              <div>
                {thisWeek.map((item) => (
                  <ExpiryCheckItem
                    key={item.id}
                    item={item}
                    categoryColor={
                      item.category_id ? (categoryMap.get(item.category_id)?.color ?? null) : null
                    }
                    onCheck={handleCheck}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: rest of this month */}
        <div className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">{t("thisMonth")}</h2>
          {thisMonth.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noThisMonth")}</p>
          ) : (
            <div>
              {thisMonth.map((item) => (
                <ExpiryCheckItem
                  key={item.id}
                  item={item}
                  categoryColor={
                    item.category_id ? (categoryMap.get(item.category_id)?.color ?? null) : null
                  }
                  onCheck={handleCheck}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calendar */}
      <ExpiryCalendar items={items} categories={categories} />
    </div>
  );
};

export const Route = createFileRoute("/_auth/calendar")({
  component: CalendarPage,
});
