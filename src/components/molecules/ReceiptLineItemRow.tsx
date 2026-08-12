import { AlertTriangle, Check, Loader2, Trash2, X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Category, StorageLocation } from "@/types/item";
import type { ReceiptDraftItem } from "@/types/receipt";

export type ReceiptRowStatus = "pending" | "registering" | "success" | "failed";

interface ReceiptLineItemRowProps {
  draft: ReceiptDraftItem;
  categories: Pick<Category, "id" | "name">[];
  locations: Pick<StorageLocation, "id" | "name">[];
  status?: ReceiptRowStatus;
  onChange: (patch: Partial<ReceiptDraftItem>) => void;
  onRemove: () => void;
}

/** 抽出1行の編集UI（名前・数量・単価・カテゴリ・保管場所・期限日・除外チェック）。
 *  Supabase呼び出しは行わない（receipt-scan.md「フロントエンド」節）。 */
export const ReceiptLineItemRow = ({
  draft,
  categories,
  locations,
  status = "pending",
  onChange,
  onRemove,
}: ReceiptLineItemRowProps) => {
  const { t } = useTranslation("receiptScan");
  const { t: ti } = useTranslation("items");
  const isBusy = status === "registering" || status === "success";
  const idPrefix = useId();
  const quantityFieldId = `${idPrefix}-quantity`;
  const unitPriceFieldId = `${idPrefix}-unit-price`;
  const categoryFieldId = `${idPrefix}-category`;
  const storageLocationFieldId = `${idPrefix}-storage-location`;
  const expiryDateFieldId = `${idPrefix}-expiry-date`;

  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${draft.included ? "" : "border-dashed text-muted-foreground"} ${
        draft.confidence === "low" ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/10" : ""
      }`}
    >
      {/* #823 a11y: dim the excluded state via a muted text color + dashed
       *  border rather than `opacity-50` on the whole row — opacity halves
       *  contrast for every descendant (inputs, selects, labels) and fails
       *  WCAG AA (axe `color-contrast`), whereas `text-muted-foreground` is
       *  already contrast-checked and used elsewhere in this same form. */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.included}
          onChange={(e) => onChange({ included: e.target.checked })}
          disabled={isBusy}
          aria-label={t("includeRow")}
          className="h-4 w-4 shrink-0 rounded"
        />
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t("itemNamePlaceholder")}
          disabled={isBusy}
          className="flex-1"
          aria-label={ti("name")}
        />
        {status === "registering" && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        {status === "success" && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
        {status === "failed" && <X className="h-4 w-4 shrink-0 text-destructive" />}
        {status === "pending" && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("removeRow")}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {draft.confidence === "low" && (
        <p className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t("lowConfidenceHint")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={quantityFieldId} className="text-xs text-muted-foreground">
            {t("quantity")}
          </label>
          <Input
            id={quantityFieldId}
            type="number"
            min={1}
            step={1}
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
            disabled={isBusy}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={unitPriceFieldId} className="text-xs text-muted-foreground">
            {t("unitPrice")}
          </label>
          <Input
            id={unitPriceFieldId}
            type="number"
            min={0}
            step={1}
            value={draft.unitPrice ?? ""}
            placeholder="—"
            onChange={(e) =>
              onChange({
                unitPrice: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
              })
            }
            disabled={isBusy}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={categoryFieldId} className="text-xs text-muted-foreground">
            {ti("category")}
          </label>
          <Select
            id={categoryFieldId}
            value={draft.categoryId ?? ""}
            onChange={(e) => onChange({ categoryId: e.target.value || null })}
            disabled={isBusy}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={storageLocationFieldId} className="text-xs text-muted-foreground">
            {ti("storageLocation")}
          </label>
          <Select
            id={storageLocationFieldId}
            value={draft.storageLocationId ?? ""}
            onChange={(e) => onChange({ storageLocationId: e.target.value || null })}
            disabled={isBusy}
          >
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <label htmlFor={expiryDateFieldId} className="text-xs text-muted-foreground">
            {ti("expiryDate")}
          </label>
          <Input
            id={expiryDateFieldId}
            type="date"
            value={draft.expiryDate ?? ""}
            onChange={(e) => onChange({ expiryDate: e.target.value || null })}
            disabled={isBusy}
          />
        </div>
      </div>
    </div>
  );
};
