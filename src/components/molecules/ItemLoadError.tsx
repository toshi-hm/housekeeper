import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface ItemLoadErrorProps {
  onRetry: () => void;
  onBack: () => void;
}

/** アイテム取得エラー（「見つからない」と区別して再試行を提供する, #1243） */
export const ItemLoadError = ({ onRetry, onBack }: ItemLoadErrorProps) => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="icon" aria-label={tc("back")} onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-destructive p-4 text-destructive"
      >
        <p className="font-medium">{t("itemLoadError")}</p>
        <Button variant="outline" onClick={onRetry}>
          {tc("retry")}
        </Button>
      </div>
    </div>
  );
};
