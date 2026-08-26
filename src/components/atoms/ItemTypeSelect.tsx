import { useTranslation } from "react-i18next";

import { itemTypeLabelKey } from "@/lib/itemType";
import { cn } from "@/lib/utils";
import { ITEM_TYPES, type ItemType } from "@/types/item";

interface ItemTypeSelectProps {
  value: ItemType;
  onChange: (value: ItemType) => void;
  id?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
}

const buttonClass = (active: boolean) =>
  cn(
    "flex min-h-10 flex-1 items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
  );

/** 「食料品」/「日用品」の2択セグメントコントロール。
 *  `ExpiryTypeSelect` と異なり未設定を選べない — アイテム側の「未設定（カテゴリ既定に
 *  追従）」は呼び出し側が解決済みの実効値を渡す形で表現する
 *  （docs/specs/features/item-type.md）。 */
export const ItemTypeSelect = ({
  value,
  onChange,
  id,
  disabled = false,
  "aria-describedby": ariaDescribedBy,
}: ItemTypeSelectProps) => {
  const { t } = useTranslation("items");

  return (
    <div
      id={id}
      role="group"
      aria-label={t("itemType")}
      aria-describedby={ariaDescribedBy}
      className="inline-flex w-full items-center gap-0.5 rounded-md border p-0.5"
    >
      {ITEM_TYPES.map((itemType) => (
        <button
          key={itemType}
          type="button"
          aria-pressed={value === itemType}
          disabled={disabled}
          onClick={() => onChange(itemType)}
          className={buttonClass(value === itemType)}
        >
          {t(itemTypeLabelKey[itemType])}
        </button>
      ))}
    </div>
  );
};
