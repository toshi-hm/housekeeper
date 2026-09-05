import { PackageMinus, X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { formatRemaining } from "@/types/item";

interface QuickConsumeSheetProps {
  open: boolean;
  itemName: string;
  units: number;
  contentAmount: number;
  contentUnit: string;
  openedRemaining: number | null;
  isConsuming?: boolean;
  /** 「1点使う」（`content_amount` 分を即時消費）。 */
  onConsumeOne: () => void;
  /** 「一部使用」（既存の消費画面へ遷移して数量を入力する）。 */
  onConsumePartial: () => void;
  /** 「新規登録として追加する」の脱出リンク（既存の新規登録フローへ戻る）。 */
  onAddNewItem: () => void;
  onClose: () => void;
}

/**
 * バーコードスキャンが既存アイテム（在庫あり）に一致したときに、新規登録フォームへ
 * 進む代わりに表示するボトムシート（#924, docs/specs/features/quick-consume.md）。
 *
 * 「1点使う」「一部使用」はいずれも消費デクリメント自体を持たず、既存の
 * `useConsumeItem` / `consumeLot` へ委譲する（呼び出し側の責務）。このコンポーネント
 * 自身はpropsのみで動作する純粋な表示molecule（Supabase/Queryフックは持たない）。
 */
export const QuickConsumeSheet = ({
  open,
  itemName,
  units,
  contentAmount,
  contentUnit,
  openedRemaining,
  isConsuming = false,
  onConsumeOne,
  onConsumePartial,
  onAddNewItem,
  onClose,
}: QuickConsumeSheetProps) => {
  const { t } = useTranslation("items");
  const { t: tCommon } = useTranslation("common");
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>({
    open,
    onClose,
    disableClose: isConsuming,
  });

  if (!open) return null;

  const remaining = formatRemaining(units, contentAmount, openedRemaining);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center"
      onClick={() => !isConsuming && onClose()}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <PackageMinus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                {t("quickConsumeSheetTitle", { name: itemName })}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("quickConsumeSheetCurrentStock", { amount: remaining, unit: contentUnit })}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isConsuming}
            aria-label={tCommon("close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={onConsumeOne} disabled={isConsuming} className="w-full">
            {isConsuming ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {t("quickConsumeSheetConsumeOne", { amount: contentAmount, unit: contentUnit })}
          </Button>
          <Button
            variant="outline"
            onClick={onConsumePartial}
            disabled={isConsuming}
            className="w-full"
          >
            {t("quickConsumeSheetConsumePartial")}
          </Button>
          <Button
            variant="ghost"
            onClick={onAddNewItem}
            disabled={isConsuming}
            className="w-full text-sm text-muted-foreground"
          >
            {t("quickConsumeSheetAddNewItem")}
          </Button>
        </div>
      </div>
    </div>
  );
};
