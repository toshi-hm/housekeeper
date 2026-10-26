import { Link } from "@tanstack/react-router";
import { Check, Minus, NotebookPen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ExpiryBadge } from "@/components/atoms/ExpiryBadge";
import { OpenedAlertBadge } from "@/components/atoms/OpenedAlertBadge";
import { SwipeableRow } from "@/components/molecules/SwipeableRow";
import { cn } from "@/lib/utils";
import { formatRemaining, getExpiryStatus, type Item } from "@/types/item";

interface ItemListRowProps {
  item: Item;
  warningDays?: number;
  /** 開封後使用推奨日数（アイテム個別設定とカテゴリ既定値を呼び出し元で解決した値、
   *  {@link resolveOpenedAlertThresholdDays}）。未設定なら開封アラートは表示しない（#752）。 */
  openedAlertThresholdDays?: number | null;
  /** 一括操作の選択モード（#359） */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (item: Item) => void;
  /** 左スワイプで1個消費する（ItemCard のクイック消費と同じ操作）。未指定ならスワイプ無効。 */
  onQuickConsume?: (item: Item) => void;
  /** 他アイテムのクイック消費が処理中の間、スワイプ消費を無効化する（#571）。 */
  quickConsumeDisabled?: boolean;
  isQuickConsuming?: boolean;
  /** 右スワイプでクイックメモ（#380）を開く。未指定ならこの方向のスワイプは無効。 */
  onQuickMemo?: (item: Item) => void;
}

/**
 * ダッシュボードのリスト表示用コンパクト行（#387）。
 * カード表示 (ItemCard) と異なり、名前・残量・期限のみを1行で表示する。
 */
export const ItemListRow = ({
  item,
  warningDays,
  openedAlertThresholdDays,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onQuickConsume,
  quickConsumeDisabled = false,
  isQuickConsuming = false,
  onQuickMemo,
}: ItemListRowProps) => {
  const { t } = useTranslation("items");
  const expiryStatus = getExpiryStatus(item.expiry_date, warningDays);
  const isEmpty = item.units === 0;

  const rowInner = (
    <div
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
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
      <ExpiryBadge
        expiryDate={item.expiry_date}
        warningDays={warningDays}
        expiryType={item.expiry_type}
      />
      <OpenedAlertBadge openedAt={item.opened_at} thresholdDays={openedAlertThresholdDays} />
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

  // スワイプはタッチ操作の近道。キーボード・スクリーンリーダー利用者は
  // 行を開いた詳細画面から同じ消費・メモ操作を行える。
  const canConsume = !!onQuickConsume && !isEmpty && !isQuickConsuming && !quickConsumeDisabled;

  return (
    <SwipeableRow
      leftAction={
        canConsume
          ? {
              label: t("quickConsume"),
              icon: <Minus className="h-4 w-4" aria-hidden="true" />,
              className: "bg-primary",
              onTrigger: () => onQuickConsume(item),
            }
          : undefined
      }
      rightAction={
        onQuickMemo
          ? {
              label: t("quickMemo"),
              icon: <NotebookPen className="h-4 w-4" aria-hidden="true" />,
              className: "bg-sky-600",
              onTrigger: () => onQuickMemo(item),
            }
          : undefined
      }
    >
      <Link
        to="/items/$itemId"
        params={{ itemId: item.id }}
        aria-label={item.name}
        className="block"
      >
        {rowInner}
      </Link>
    </SwipeableRow>
  );
};
