import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ExpiryBadge } from "@/components/atoms/ExpiryBadge";
import { cn } from "@/lib/utils";
import { formatRemaining, getExpiryStatus, type Item } from "@/types/item";

interface ItemListRowProps {
  item: Item;
  warningDays?: number;
  /** 一括操作の選択モード（#359） */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (item: Item) => void;
}

/**
 * ダッシュボードのリスト表示用コンパクト行（#387）。
 * カード表示 (ItemCard) と異なり、名前・残量・期限のみを1行で表示する。
 */
export const ItemListRow = ({
  item,
  warningDays,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: ItemListRowProps) => {
  const { t } = useTranslation("items");
  const expiryStatus = getExpiryStatus(item.expiry_date, warningDays);
  const isEmpty = item.units === 0;

  const rowInner = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
        expiryStatus === "expiring-soon" && !isEmpty && "border-yellow-400 bg-yellow-50/50",
        expiryStatus === "expired" && !isEmpty && "border-red-400 bg-red-50/50",
        isEmpty && "opacity-50",
        selectionMode && isSelected && "border-primary bg-primary/5 ring-2 ring-primary",
      )}
    >
      {selectionMode && (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 bg-background",
          )}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {isEmpty
          ? t("emptyStock")
          : t("listRemainingDisplay", {
              amount: formatRemaining(
                item.units,
                item.content_amount,
                item.opened_remaining ?? null,
              ),
              unit: item.content_unit,
            })}
      </span>
      <ExpiryBadge expiryDate={item.expiry_date} warningDays={warningDays} />
    </div>
  );

  if (selectionMode) {
    return (
      <div
        role="checkbox"
        aria-checked={isSelected}
        aria-label={item.name}
        tabIndex={0}
        onClick={() => onToggleSelect?.(item)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleSelect?.(item);
          }
        }}
        className="block cursor-pointer"
      >
        {rowInner}
      </div>
    );
  }

  return (
    <Link to="/items/$itemId" params={{ itemId: item.id }} aria-label={item.name} className="block">
      {rowInner}
    </Link>
  );
};
