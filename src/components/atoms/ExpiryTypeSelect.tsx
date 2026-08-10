import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { type ExpiryType } from "@/types/item";

interface ExpiryTypeSelectProps {
  value: ExpiryType | null;
  onChange: (value: ExpiryType | null) => void;
  id?: string;
}

const buttonClass = (active: boolean) =>
  cn(
    "flex min-h-10 flex-1 items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
  );

/** 「賞味期限」/「消費期限」/未設定 の3択セグメントコントロール (#714)。
 *  ItemForm から使う。未設定を選べる点が ViewModeToggle と異なる（既存アイテムは
 *  区別なしのまま残せる後方互換のため）。 */
export const ExpiryTypeSelect = ({ value, onChange, id }: ExpiryTypeSelectProps) => {
  const { t } = useTranslation("items");

  return (
    <div
      id={id}
      role="group"
      aria-label={t("expiryType")}
      className="inline-flex w-full items-center gap-0.5 rounded-md border p-0.5"
    >
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={buttonClass(value === null)}
      >
        {t("expiryTypeUnset")}
      </button>
      <button
        type="button"
        aria-pressed={value === "best_before"}
        onClick={() => onChange("best_before")}
        className={buttonClass(value === "best_before")}
      >
        {t("expiryTypeBestBefore")}
      </button>
      <button
        type="button"
        aria-pressed={value === "use_by"}
        onClick={() => onChange("use_by")}
        className={buttonClass(value === "use_by")}
      >
        {t("expiryTypeUseBy")}
      </button>
    </div>
  );
};
