import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface ShoppingModeAlertRowProps {
  name: string;
  detail?: string;
  /** 期限バッジなど、名前の隣に添える補足表示（`ExpiryBadge` 等）。 */
  badge?: ReactNode;
  /** 未指定の場合は追加ボタン自体を表示しない（対象アイテムに紐づく在庫が無い等）。 */
  onAdd?: () => void;
  isAdded?: boolean;
  isPending?: boolean;
}

/**
 * ショッピングモード（#926）の低在庫/期限間近セクションで使う、大きめタップ領域の
 * 読み取り専用アラート行。「リストに追加」ボタンのみを持ち、編集・削除は行わない
 * （買い物中に手を止めず確認できることを優先する）。
 */
export const ShoppingModeAlertRow = ({
  name,
  detail,
  badge,
  onAdd,
  isAdded,
  isPending,
}: ShoppingModeAlertRowProps) => {
  const { t } = useTranslation("shopping");

  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium">{name}</p>
          {badge}
        </div>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>
      {onAdd && (
        <Button
          size="lg"
          variant={isAdded ? "outline" : "default"}
          className="shrink-0"
          onClick={onAdd}
          disabled={isAdded || isPending}
        >
          {isAdded ? t("shoppingModeAdded") : t("shoppingModeAddToList")}
        </Button>
      )}
    </div>
  );
};
