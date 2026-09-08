import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { OfflineQueuedAction } from "@/lib/offlineActionQueue";

interface OfflineQueuePanelProps {
  /** `useOfflineActionQueue().queuedActions`。積まれた順のまま渡す。空配列なら
   *  何も描画しない。 */
  actions: OfflineQueuedAction[];
  /** 指定したアクションの手動破棄をリクエストする。実際の削除確認は呼び出し元
   *  （`_auth.shopping.tsx`）の `ConfirmDialog` に委ね、このコンポーネント自体は
   *  破棄を確定しない（誤タップで同期前の操作を失わないようにするため）。 */
  onRequestDiscard: (action: OfflineQueuedAction) => void;
}

const kindLabelKey = {
  purchase: "offlineQueuePanelKindPurchase",
  "add-alert": "offlineQueuePanelKindAddAlert",
} as const satisfies Record<OfflineQueuedAction["kind"], string>;

const actionDisplayName = (action: OfflineQueuedAction): string =>
  action.kind === "purchase" ? action.payload.itemValues.name : action.payload.name;

/**
 * #1021: 買い物中モードのオフラインキュー（`useOfflineActionQueue`）に残っている
 * 未同期アクション（購入確定・買い物リストへの追加）を可視化し、個別に破棄できる
 * ようにするパネル。恒久的エラーとして自動判定されず（`isPermanentReplayError`）
 * キューに残り続けている一時的な失敗を、ユーザーが内容を確認した上で手動整理
 * できるようにするための導線。
 *
 * 買い物中モードの他のUI（`ShoppingModeAlertRow`等）と同じく大きめタップ領域を
 * 意識しつつ、通常は表示頻度が低い補助的な情報のため折りたたみ表示にしている。
 */
export const OfflineQueuePanel = ({ actions, onRequestDiscard }: OfflineQueuePanelProps) => {
  const { t } = useTranslation("shopping");
  const [isOpen, setIsOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="offline-queue-panel-list"
      >
        <span>{t("offlineQueuePanelTitle", { count: actions.length })}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
      </button>
      {isOpen && (
        <ul id="offline-queue-panel-list" className="space-y-1 border-t p-2">
          {actions.map((action) => (
            <li
              key={action.id}
              className="flex items-center justify-between gap-2 rounded-md p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{actionDisplayName(action)}</p>
                <p className="text-xs text-muted-foreground">{t(kindLabelKey[action.kind])}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRequestDiscard(action)}
                aria-label={t("offlineQueuePanelDiscardAriaLabel", {
                  name: actionDisplayName(action),
                })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
