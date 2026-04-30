import { CheckCircle2, ShoppingCart, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface ShoppingRowProps {
  id: string;
  name: string;
  desiredUnits: number;
  note?: string | null;
  isPurchased?: boolean;
  onPurchase?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const ShoppingRow = ({
  id,
  name,
  desiredUnits,
  note,
  isPurchased,
  onPurchase,
  onDelete,
}: ShoppingRowProps) => {
  const { t } = useTranslation("shopping");

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${isPurchased ? "opacity-60" : ""}`}
    >
      {isPurchased ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
      ) : (
        <ShoppingCart className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${isPurchased ? "line-through" : ""}`}>{name}</p>
        <p className="text-sm text-muted-foreground">
          {t("desiredUnits")}: {desiredUnits}
          {note && ` · ${note}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {!isPurchased && onPurchase && (
          <Button variant="outline" size="sm" onClick={() => onPurchase(id)}>
            {t("markPurchased")}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
