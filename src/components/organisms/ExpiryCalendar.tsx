import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ColorDot } from "@/components/atoms/ColorDot";
import { Button } from "@/components/ui/button";
import type { Category, Item } from "@/types/item";

interface ExpiryCalendarProps {
  items: Item[];
  categories: Category[];
}

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const ExpiryCalendar = ({ items, categories }: ExpiryCalendarProps) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // group items by expiry_date key
  const itemsByDate = new Map<string, Item[]>();
  for (const item of items) {
    if (!item.expiry_date) continue;
    const key = item.expiry_date.slice(0, 10);
    const existing = itemsByDate.get(key) ?? [];
    itemsByDate.set(key, [...existing, item]);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const todayKey = toDateKey(today);

  const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div className="rounded-lg border bg-background p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="前の月">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">
          {year}年{month + 1}月
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="次の月">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day labels */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-xs font-medium ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = itemsByDate.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          const dow = (firstDay + i) % 7;

          return (
            <div
              key={day}
              className={`flex min-h-[48px] flex-col items-center border-t pt-1 ${isToday ? "bg-primary/5" : ""}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday
                    ? "bg-primary font-bold text-primary-foreground"
                    : dow === 0
                      ? "text-red-500"
                      : dow === 6
                        ? "text-blue-500"
                        : "text-foreground"
                }`}
              >
                {day}
              </span>
              {/* Category color dots — max 3 */}
              {dayItems.length > 0 && (
                <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {dayItems.slice(0, 3).map((item) => {
                    const cat = item.category_id ? categoryMap.get(item.category_id) : null;
                    return <ColorDot key={item.id} color={cat?.color} className="h-2 w-2" />;
                  })}
                  {dayItems.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{dayItems.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
