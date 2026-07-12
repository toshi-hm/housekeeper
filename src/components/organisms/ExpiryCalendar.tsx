import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ColorDot } from "@/components/atoms/ColorDot";
import { Button } from "@/components/ui/button";
import { type Category, type ExpiryStatus, getExpiryStatus, type Item } from "@/types/item";

interface ExpiryCalendarProps {
  items: Item[];
  categories: Category[];
  warningDays?: number;
  labels: {
    close: string;
    noItemsOnDate: string;
    expiryItemsOnDate: (date: string) => string;
    legendExpired: string;
    legendSoon: string;
    legendOk: string;
  };
}

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** その日に期限を迎えるアイテム群のうち、最も緊急な期限ステータスを返す。 */
const mostUrgentStatus = (items: Item[], warningDays?: number): ExpiryStatus => {
  let result: ExpiryStatus = "unknown";
  for (const item of items) {
    const status = getExpiryStatus(item.expiry_date, warningDays);
    if (status === "expired") return "expired";
    if (status === "expiring-soon") result = "expiring-soon";
    else if (status === "ok" && result !== "expiring-soon") result = "ok";
  }
  return result;
};

/** 期限ステータス → カレンダーの日付セル上辺ボーダー色（赤/黄/緑）。 */
const statusBorderClass: Record<ExpiryStatus, string> = {
  expired: "border-t-red-400",
  "expiring-soon": "border-t-yellow-400",
  ok: "border-t-green-400",
  unknown: "",
};

export const ExpiryCalendar = ({ items, categories, warningDays, labels }: ExpiryCalendarProps) => {
  const { i18n, t } = useTranslation("calendar");
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(i18n.language, { month: "short" }),
  );
  // Jan 4, 1970 (Unix epoch + 3 days) was a Sunday
  const dayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(1970, 0, 4 + i).toLocaleDateString(i18n.language, { weekday: "narrow" }),
  );

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

  const openPicker = () => {
    setPickerYear(year);
    setShowPicker(true);
  };

  const selectMonth = (m: number) => {
    setYear(pickerYear);
    setMonth(m);
    setShowPicker(false);
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
  const selectedItems = selectedDateKey ? (itemsByDate.get(selectedDateKey) ?? []) : [];

  return (
    <div className="rounded-lg border bg-background p-3">
      {/* Header */}
      <div className="relative mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth} aria-label={t("prevMonth")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="rounded px-2 py-1 text-sm font-semibold hover:bg-muted"
          onClick={openPicker}
          aria-label={t("selectYearMonth")}
        >
          {new Date(year, month, 1).toLocaleDateString(i18n.language, {
            year: "numeric",
            month: "long",
          })}
        </button>
        <Button variant="ghost" size="icon" onClick={nextMonth} aria-label={t("nextMonth")}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Year/Month picker dropdown */}
        {showPicker && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowPicker(false)}
              aria-hidden="true"
            />
            <div
              ref={pickerRef}
              className="absolute left-1/2 top-full z-20 mt-1 w-64 -translate-x-1/2 rounded-lg border bg-background p-3 shadow-lg"
            >
              {/* Year selector */}
              <div className="mb-3 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPickerYear((y) => y - 1)}
                  aria-label={t("prevYear")}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-sm font-semibold">
                  {new Date(pickerYear, 0, 1).toLocaleDateString(i18n.language, {
                    year: "numeric",
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPickerYear((y) => y + 1)}
                  aria-label={t("nextYear")}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
              {/* Month grid */}
              <div className="grid grid-cols-4 gap-1">
                {monthLabels.map((label, i) => (
                  <button
                    key={label}
                    className={`rounded py-1.5 text-xs font-medium transition-colors ${
                      pickerYear === year && i === month
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => selectMonth(i)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Day labels */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {dayLabels.map((d, i) => (
          <div
            key={i}
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
          const status = dayItems.length > 0 ? mostUrgentStatus(dayItems, warningDays) : "unknown";

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDateKey(dateKey)}
              className={`flex min-h-[56px] flex-col items-center border-t-2 pt-1 text-left transition-colors hover:bg-muted/50 ${statusBorderClass[status]} ${isToday ? "bg-primary/5" : ""}`}
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
            </button>
          );
        })}
      </div>

      {/* Expiry status legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-red-400" />
          {labels.legendExpired}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-yellow-400" />
          {labels.legendSoon}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-green-400" />
          {labels.legendOk}
        </span>
      </div>

      {selectedDateKey && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setSelectedDateKey(null)}
            aria-label={labels.close}
          />
          <div className="relative z-10 max-h-[70vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{labels.expiryItemsOnDate(selectedDateKey)}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDateKey(null)}>
                {labels.close}
              </Button>
            </div>
            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.noItemsOnDate}</p>
            ) : (
              <ul className="space-y-2">
                {selectedItems.map((item) => {
                  const cat = item.category_id ? categoryMap.get(item.category_id) : null;
                  return (
                    <li key={item.id} className="flex items-start gap-2 rounded-md border p-2">
                      <ColorDot color={cat?.color} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{item.name}</p>
                        {item.expiry_date && (
                          <p className="text-xs text-muted-foreground">
                            {item.expiry_date.slice(0, 10)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
