import { PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { type ExpiryApprox, getExpiryApprox } from "@/types/item";

interface AlreadyInStockBannerProps {
  /** 在庫あり点数（アイテムの units）。 */
  units: number;
  /** 保管場所名。未設定の場合は場所を省いた文言になる。 */
  locationName?: string | null;
  /** 賞味期限 (YYYY-MM-DD)。未設定の場合は期限の概算表示を省く。 */
  expiryDate?: string | null;
  /** 「新規ロットとして追加する」（買い足しなど正当なケース）を選んだとき。 */
  onAddNewLot: () => void;
  /** 「既存アイテムを見る・消費する」を選んだとき。 */
  onViewExisting: () => void;
}

type ExpiryPhraseKind = "dayFuture" | "dayPast" | "monthFuture" | "monthPast";

const expiryPhraseKey = {
  dayFuture: "alreadyInStockBanner.expiryDaysFuture",
  dayPast: "alreadyInStockBanner.expiryDaysPast",
  monthFuture: "alreadyInStockBanner.expiryMonthsFuture",
  monthPast: "alreadyInStockBanner.expiryMonthsPast",
} as const satisfies Record<ExpiryPhraseKind, string>;

const expiryPhraseKind = (approx: ExpiryApprox): ExpiryPhraseKind =>
  `${approx.unit}${approx.isPast ? "Past" : "Future"}` as ExpiryPhraseKind;

/**
 * バーコードスキャンで DB 優先ルックアップ（docs/specs/features/barcode.md §5）がヒットし、
 * かつ在庫あり（`isAlreadyInStock`）と判定されたときに `ItemForm` の上に表示するバナー (#559)。
 *
 * 「新規ロットとして追加する（買い足しなど）」「既存アイテムを見る・消費する」の
 * 2択を明示し、ユーザーが誤って重複した新規アイテムを作らないよう促す。
 */
export const AlreadyInStockBanner = ({
  units,
  locationName,
  expiryDate,
  onAddNewLot,
  onViewExisting,
}: AlreadyInStockBannerProps) => {
  const { t } = useTranslation("items");

  const stockLine = locationName
    ? t("alreadyInStockBanner.bodyWithLocation", { location: locationName, units })
    : t("alreadyInStockBanner.bodyNoLocation", { units });

  const expiryApprox = expiryDate ? getExpiryApprox(expiryDate) : null;
  const expiryText = expiryApprox
    ? t(expiryPhraseKey[expiryPhraseKind(expiryApprox)], { count: expiryApprox.value })
    : null;

  return (
    <div
      role="status"
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <div className="flex items-start gap-2">
        <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            {t("alreadyInStockBanner.title")}
          </p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-200">
            {stockLine}
            {expiryText ? `（${expiryText}）` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onAddNewLot}>
          {t("alreadyInStockBanner.addNewLot")}
        </Button>
        <Button type="button" size="sm" className="flex-1" onClick={onViewExisting}>
          {t("alreadyInStockBanner.viewExisting")}
        </Button>
      </div>
    </div>
  );
};
