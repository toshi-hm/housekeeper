import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";

interface ItemListSkeletonProps {
  /** ダッシュボードの表示モード（カード / リスト）に合わせた形で描画する */
  variant: "grid" | "list";
  count?: number;
}

/** 在庫一覧の読み込み中プレースホルダ。実際のレイアウトと同じ形でレイアウトシフトを抑える。 */
export const ItemListSkeleton = ({ variant, count = 8 }: ItemListSkeletonProps) => {
  const { t } = useTranslation("common");
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <div role="status" aria-busy="true" aria-label={t("loading")}>
      {variant === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <Skeleton className="aspect-square w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
};
