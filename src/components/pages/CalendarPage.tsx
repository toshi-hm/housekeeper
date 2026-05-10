import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ExpiryCheckItem } from "@/components/molecules/ExpiryCheckItem";
import { ExpiryCalendar } from "@/components/organisms/ExpiryCalendar";
import type { Category, Item } from "@/types/item";

interface CalendarPageProps {
  items: Item[];
  categories: Category[];
  isLoading: boolean;
  onCheck: (id: string) => Promise<void>;
}

export const CalendarPage = ({ items, categories, isLoading, onCheck }: CalendarPageProps) => {
  const { t } = useTranslation("calendar");
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
      {items.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">{t("noItems")}</p>
          <p className="mt-1 text-xs">{t("noItemsHint")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold text-destructive">{t("expired")}</h2>
            {expired.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noExpired")}</p>
            ) : (
              <div className="space-y-1">
                {expired.map((item) => (
                  <ExpiryCheckItem
                    key={item.id}
                    item={item}
                    categoryColor={
                      item.category_id ? (categoryMap.get(item.category_id)?.color ?? null) : null
                    }
                    onCheck={onCheck}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold text-yellow-600">{t("thisWeek")}</h2>
            {thisWeek.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noThisWeek")}</p>
            ) : (
              <div className="space-y-1">
                {thisWeek.map((item) => (
                  <ExpiryCheckItem
                    key={item.id}
                    item={item}
                    categoryColor={
                      item.category_id ? (categoryMap.get(item.category_id)?.color ?? null) : null
                    }
                    onCheck={onCheck}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">{t("thisMonth")}</h2>
          {thisMonth.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noThisMonth")}</p>
          ) : (
            <div className="space-y-1">
              {thisMonth.map((item) => (
                <ExpiryCheckItem
                  key={item.id}
                  item={item}
                  categoryColor={
                    item.category_id ? (categoryMap.get(item.category_id)?.color ?? null) : null
                  }
                  onCheck={onCheck}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ExpiryCalendar
        items={items}
        categories={categories}
        labels={{
          close: t("close"),
          noItemsOnDate: t("noItemsOnDate"),
          expiryItemsOnDate: (date) => t("expiryItemsOnDate", { date }),
        }}
      />
    </div>
  );
};
