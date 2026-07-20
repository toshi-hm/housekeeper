import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface PurchaseHistoryRowProps {
  id: string;
  name: string;
  desiredUnits: number;
  note?: string | null;
  onRestock?: (id: string) => void;
  isRestocking?: boolean;
}

/** 購入履歴（アーカイブ）1件の表示行。「再購入」でショッピングリストに戻せる (#365)。 */
export const PurchaseHistoryRow = ({
  id,
  name,
  desiredUnits,
  note,
  onRestock,
  isRestocking,
}: PurchaseHistoryRowProps) => {
  const { t } = useTranslation("shopping");

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">
          {t("desiredUnits")}: {desiredUnits}
          {note && ` · ${note}`}
        </p>
      </div>
      {onRestock && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onRestock(id)}
          disabled={isRestocking}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          {t("restock")}
        </Button>
      )}
    </div>
  );
};
