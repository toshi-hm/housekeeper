import { MapPin, Minus, Tag, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface BulkActionBarProps {
  selectedCount: number;
  disabled?: boolean;
  onChangeLocation: () => void;
  onChangeCategory: () => void;
  onConsume: () => void;
  onDelete: () => void;
}

/** ダッシュボードの選択モードで下部に表示する一括操作バー（#359）。 */
export const BulkActionBar = ({
  selectedCount,
  disabled = false,
  onChangeLocation,
  onChangeCategory,
  onConsume,
  onDelete,
}: BulkActionBarProps) => {
  const { t } = useTranslation("items");
  const isEmpty = selectedCount === 0;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-background/95 p-2 shadow-lg backdrop-blur lg:bottom-0 lg:left-64">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-2">
        <span className="text-sm font-medium">
          {t("bulkSelectedCount", { count: selectedCount })}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || isEmpty}
            onClick={onChangeLocation}
          >
            <MapPin className="mr-1 h-4 w-4" />
            {t("bulkChangeLocation")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || isEmpty}
            onClick={onChangeCategory}
          >
            <Tag className="mr-1 h-4 w-4" />
            {t("bulkChangeCategory")}
          </Button>
          <Button size="sm" variant="outline" disabled={disabled || isEmpty} onClick={onConsume}>
            <Minus className="mr-1 h-4 w-4" />
            {t("bulkConsume")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={disabled || isEmpty}
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {t("bulkDelete")}
          </Button>
        </div>
      </div>
    </div>
  );
};
