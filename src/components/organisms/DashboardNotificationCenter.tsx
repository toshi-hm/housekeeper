import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface NotificationChip {
  key: string;
  icon: ReactNode;
  text: string;
}

interface DashboardNotificationCenterProps {
  /** 種別ごとのアイコン+件数チップ（0件の種別は呼び出し側で除外して渡す） */
  chips: NotificationChip[];
  /** 展開時に表示する既存バナー群（ロジック・見た目はそのまま子として内包する） */
  children: ReactNode;
}

/**
 * ダッシュボードの複数警告バナー（期限切れ/低在庫/消費ペース予測/棚卸し未確認）を
 * 折りたたみ式の単一サマリーバーに統合する（#624）。通知が0件のときはサマリーバー
 * 自体を非表示にし、画面占有をゼロにする。既存の各バナーの算出ロジック・アクション
 * ボタンは変更せず、表示レイヤーの統合のみを行う。
 */
export const DashboardNotificationCenter = ({
  chips,
  children,
}: DashboardNotificationCenterProps) => {
  const [expanded, setExpanded] = useState(false);

  if (chips.length === 0) return null;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
          {chips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1">
              {chip.icon}
              {chip.text}
            </span>
          ))}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="space-y-3 border-t p-3">{children}</div>}
    </div>
  );
};
