import { LayoutGrid, List } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const buttonClass = (active: boolean) =>
  cn(
    "flex h-7 w-7 items-center justify-center rounded transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
  );

export const ViewModeToggle = ({ value, onChange }: ViewModeToggleProps) => {
  const { t } = useTranslation("items");

  return (
    <div
      role="group"
      aria-label={t("viewModeToggleLabel")}
      className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
    >
      <button
        type="button"
        aria-label={t("viewModeGrid")}
        aria-pressed={value === "grid"}
        onClick={() => onChange("grid")}
        className={buttonClass(value === "grid")}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={t("viewModeList")}
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
        className={buttonClass(value === "list")}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
};
