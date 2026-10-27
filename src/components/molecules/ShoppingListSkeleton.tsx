import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";

interface ShoppingListSkeletonProps {
  count?: number;
}

/** 買い物リストの読み込み中プレースホルダ（ShoppingRow と同じ並び）。 */
export const ShoppingListSkeleton = ({ count = 5 }: ShoppingListSkeletonProps) => {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label={t("loading")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="h-5 w-5 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
};
