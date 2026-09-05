import { useTranslation } from "react-i18next";

interface ShoppingModeEstimatedTotalProps {
  /** 最安値ベースで合算した見込み合計金額。 */
  total: number;
  /** 比較データが無く合計から除外したアイテムが1件でもあるか。 */
  hasExcludedItems: boolean;
}

/**
 * 買い物中モードの「買い物リスト」セクション上部に表示する見込み合計金額（#982）。
 * `resolveCheapestStore` の比較データがあるアイテムのみを合算した結果を props で
 * 受け取るだけの表示専用コンポーネント（合算ロジックは `src/lib/shoppingModeTotal.ts`）。
 */
export const ShoppingModeEstimatedTotal = ({
  total,
  hasExcludedItems,
}: ShoppingModeEstimatedTotalProps) => {
  const { t } = useTranslation("shopping");

  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-sm text-muted-foreground">{t("shoppingModeEstimatedTotalLabel")}</p>
      <p className="text-xl font-semibold">
        {t("shoppingModeEstimatedTotalValue", { price: total.toLocaleString() })}
      </p>
      {hasExcludedItems && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("shoppingModeEstimatedTotalPartialNote")}
        </p>
      )}
    </div>
  );
};
