import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { StorePriceComparison } from "@/types/stats";

interface StorePriceComparisonCardProps {
  comparisons: StorePriceComparison[];
}

/** 統計ページ用の店舗別価格比較（#697）。同一アイテムを複数店舗で購入した記録がある
 *  ものだけを対象に、店舗名 × 直近単価を安い順で一覧表示する。対象データが無い場合は
 *  何も描画しない（呼び出し側がカードごと出し分ける）。 */
export const StorePriceComparisonCard = ({ comparisons }: StorePriceComparisonCardProps) => {
  const { t } = useTranslation("stats");

  if (comparisons.length === 0) return null;

  return (
    <div className="space-y-4">
      {comparisons.map((comparison) => (
        <div key={comparison.itemId}>
          <p className="mb-1 text-sm font-medium">{comparison.itemName}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">{t("storeNameLabel")}</th>
                <th className="py-1.5 font-medium">{t("storePriceUnitLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.stores.map((store, index) => (
                <tr key={store.storeName} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{store.storeName}</td>
                  <td className="py-1.5 tabular-nums">
                    ¥{store.unitPrice.toLocaleString()}
                    {index === 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {t("storePriceCheapest")}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};
