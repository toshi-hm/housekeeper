import { X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import type { Item, ItemFormValues } from "@/types/item";

interface PurchaseDialogProps {
  open: boolean;
  itemName?: string;
  /**
   * #830: `linked_item_id` 一致で既存アイテムへ統合されることが事前に分かって
   * いる場合の、その既存アイテムの現在値。渡された場合、フォームの初期値を
   * この値で埋めて既存値を確認できるようにし、送信時の入力（カテゴリ/保管場所/
   * メモ等）が items 行へ反映されることをバナーで明示する。
   * バーコード一致による統合は購入完了時にしか判明しないため対象外。
   */
  existingItem?: Item | null;
  onSubmit: (values: ItemFormValues) => void;
  onClose: () => void;
  isSubmitting?: boolean;
  onPendingFileChange?: (file: File | null) => void;
  onPendingImageUrlChange?: (url: string | null) => void;
}

export const PurchaseDialog = ({
  open,
  itemName,
  existingItem,
  onSubmit,
  onClose,
  isSubmitting = false,
  onPendingFileChange,
  onPendingImageUrlChange,
}: PurchaseDialogProps) => {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation("common");
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>({
    open,
    onClose,
    disableClose: isSubmitting,
  });

  if (!open) return null;

  // #830: 既存アイテムへ統合される場合、フォームの初期値をそのアイテムの現在値で
  // 埋める。空欄のまま保存すると入力済みの値が消えたように見えるのを防ぐ。
  const defaultValues: Partial<ItemFormValues> = existingItem
    ? {
        name: itemName ?? existingItem.name,
        category_id: existingItem.category_id ?? null,
        storage_location_id: existingItem.storage_location_id ?? null,
        notes: existingItem.notes ?? "",
        minimum_stock: existingItem.minimum_stock ?? null,
        auto_reorder: existingItem.auto_reorder ?? false,
        reorder_threshold: existingItem.reorder_threshold ?? null,
        expiry_type: existingItem.expiry_type ?? null,
        // 統合先が日用品なら期限欄を出さない。渡し忘れると null 上書きで
        // 種別の個別指定が消える（#929 セルフレビュー）。
        item_type: existingItem.item_type ?? null,
        image_path: existingItem.image_path ?? "",
        units: 1,
      }
    : { name: itemName ?? "", units: 1 };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold">
            {t("purchaseDialog")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={tCommon("close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        {existingItem && (
          <p className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            {t("mergeIntoExistingItem", { name: existingItem.name })}
          </p>
        )}
        <ItemForm
          defaultValues={defaultValues}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          submitLabel={t("createItemFromPurchase")}
          onPendingFileChange={onPendingFileChange}
          onPendingImageUrlChange={onPendingImageUrlChange}
        />
      </div>
    </div>
  );
};
