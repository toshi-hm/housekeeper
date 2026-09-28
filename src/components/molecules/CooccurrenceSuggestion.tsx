import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface CooccurrenceSuggestionProps {
  /** 一緒に買われることが多い商品名（頻度順、最大2件想定）。空配列なら何も描画しない。 */
  suggestions: string[];
  onAdd: (name: string) => void;
  onDismiss: () => void;
}

/**
 * 買い物リストへの「一緒に買われることが多い」レコメンド（#1009）の表示部分。
 * アイテム追加直後に、同じ買い物でよく一緒にアーカイブされてきた商品名を
 * ワンタップで買い物リストに追加できるチップとして提示する。
 */
export const CooccurrenceSuggestion = ({
  suggestions,
  onAdd,
  onDismiss,
}: CooccurrenceSuggestionProps) => {
  const { t } = useTranslation("shopping");

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
      <span className="text-muted-foreground">{t("cooccurrenceSuggestionLabel")}</span>
      {suggestions.map((name) => (
        <Button key={name} type="button" variant="outline" size="sm" onClick={() => onAdd(name)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {name}
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto shrink-0"
        onClick={onDismiss}
        aria-label={t("common:close")}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
