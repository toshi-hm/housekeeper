import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface SimilarItemSuggestionProps {
  /** 見つかった既存アイテムの名前（表示用）。 */
  matchName: string;
  /** 「見に行く」操作時のコールバック。ナビゲーション自体は呼び出し側に委ねる。 */
  onViewMatch: () => void;
}

/**
 * 新規登録フォームで商品名を確定した際、既存のよく似た名前のアイテムが
 * あれば気づかせる非モーダルの通知 (#990, docs/specs/features/similar-item-suggestion.md)。
 * 登録をブロックしないため確認/却下の操作は持たず、情報提示と参照導線のみを持つ。
 */
export const SimilarItemSuggestion = ({ matchName, onViewMatch }: SimilarItemSuggestionProps) => {
  const { t } = useTranslation("items");

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/30"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 text-blue-900 dark:text-blue-100">
        <p>{t("similarItemSuggestion.body", { name: matchName })}</p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-blue-800 underline-offset-2 dark:text-blue-200"
          onClick={onViewMatch}
        >
          {t("similarItemSuggestion.viewLink")}
        </Button>
      </div>
    </div>
  );
};
