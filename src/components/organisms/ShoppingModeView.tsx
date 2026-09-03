import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { ShoppingModeAlertRow } from "@/components/molecules/ShoppingModeAlertRow";
import { type CheapestStoreHint, ShoppingRow } from "@/components/molecules/ShoppingRow";
import type { ShoppingItem } from "@/types/shopping";

export interface ShoppingModeAlertEntry {
  /** 対象の在庫アイテム（`items.id`）。追加済み判定・追加アクションのキーに使う。 */
  id: string;
  name: string;
  detail?: string;
  badge?: ReactNode;
}

interface ShoppingModeViewProps {
  /** 買い物リストの未購入アイテム（購入済みは表示しない。買い物中は次に買うものだけを見せる）。 */
  plannedItems: ShoppingItem[];
  onPurchase: (id: string) => void;
  onDelete: (id: string) => void;
  lowStockItems: ShoppingModeAlertEntry[];
  expiringItems: ShoppingModeAlertEntry[];
  /** 既に買い物リストへ追加済みの在庫アイテムID（`linked_item_id`）。追加ボタンをdisabledにする。 */
  addedItemIds: ReadonlySet<string>;
  onAddAlert: (entry: ShoppingModeAlertEntry) => void;
  /** 追加処理中のアイテムID（連打防止・スピナー表示に使う）。 */
  addingItemId?: string | null;
  /** 元データ（買い物リスト・在庫・カテゴリ）の取得中かどうか。true の間は「確認事項なし」
   *  の空表示を出さずスケルトンを表示する（#977: 未取得を誤って0件と表示しない）。 */
  isLoading?: boolean;
  /** 買い物リストの行ごとの最安店舗ヒント（#697の集計を再利用、#854、#979）。
   *  比較対象データが無いアイテムは null を返す。未指定ならヒントを表示しない。 */
  resolveCheapestStore?: (item: ShoppingItem) => CheapestStoreHint | null;
}

/**
 * 買い物中モード（#926）: 買い物リスト・低在庫・期限間近アイテムを1枚の縦スクロールに
 * 統合表示する。新規データ取得は行わず、`_auth.shopping.tsx` が既存hookから集計した
 * 結果を props で受け取るだけ（片手・濡れた手・歩きながらの利用を想定し、編集操作は
 * 持たず大きめタップ領域の確認・追加アクションのみに絞る、docs/specs/accessibility.md）。
 */
export const ShoppingModeView = ({
  plannedItems,
  onPurchase,
  onDelete,
  lowStockItems,
  expiringItems,
  addedItemIds,
  onAddAlert,
  addingItemId,
  isLoading,
  resolveCheapestStore,
}: ShoppingModeViewProps) => {
  const { t } = useTranslation("shopping");

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-11 w-16 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  const isAllClear =
    plannedItems.length === 0 && lowStockItems.length === 0 && expiringItems.length === 0;

  if (isAllClear) {
    return <p className="py-8 text-center text-muted-foreground">{t("shoppingModeAllClear")}</p>;
  }

  return (
    <div className="space-y-6">
      {plannedItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("shoppingModeListTitle")}
          </h2>
          <div className="space-y-2">
            {plannedItems.map((item) => (
              <ShoppingRow
                key={item.id}
                id={item.id}
                name={item.name}
                desiredUnits={item.desired_units}
                note={item.note}
                isAutoAdded={item.auto_added}
                cheapestStore={resolveCheapestStore?.(item) ?? null}
                touchTarget
                onPurchase={onPurchase}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      )}

      {lowStockItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("shoppingModeLowStockTitle")}
          </h2>
          <div className="space-y-2">
            {lowStockItems.map((entry) => (
              <ShoppingModeAlertRow
                key={entry.id}
                name={entry.name}
                detail={entry.detail}
                badge={entry.badge}
                onAdd={() => onAddAlert(entry)}
                isAdded={addedItemIds.has(entry.id)}
                isPending={addingItemId === entry.id}
              />
            ))}
          </div>
        </section>
      )}

      {expiringItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("shoppingModeExpiringTitle")}
          </h2>
          <div className="space-y-2">
            {expiringItems.map((entry) => (
              <ShoppingModeAlertRow
                key={entry.id}
                name={entry.name}
                detail={entry.detail}
                badge={entry.badge}
                onAdd={() => onAddAlert(entry)}
                isAdded={addedItemIds.has(entry.id)}
                isPending={addingItemId === entry.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
