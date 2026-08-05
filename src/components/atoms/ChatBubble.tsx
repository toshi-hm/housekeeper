import { AlertTriangle, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChatRole } from "@/types/chat";

interface ChatBubbleProps {
  role: ChatRole;
  text: string;
  /** エラー応答であることを示す（通常の回答と視覚的に区別する） */
  isError?: boolean;
  /** 指定時、エラーバブルに再試行ボタンを表示する */
  onRetry?: () => void;
  retryLabel?: string;
}

// A single chat message bubble. User messages align right (primary),
// assistant messages align left (muted, or destructive-styled when isError).
export const ChatBubble = ({
  role,
  text,
  isError = false,
  onRetry,
  retryLabel,
}: ChatBubbleProps) => {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : isError
              ? "rounded-bl-sm border border-destructive bg-muted text-foreground"
              : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {/*
          #748 (a11y follow-up): 通常回答と区別するのは border-destructive + アイコンのみとし、
          本文/再試行ボタンの文字色は text-destructive にしない。destructiveのhslは白背景に
          対してWCAG AA(4.5:1)のcolor-contrastを満たさず、axe-core (a11y CI) で violation になるため。
        */}
        <div className={cn(isError && "flex items-start gap-2")}>
          {isError && (
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )}
          <span>{text}</span>
        </div>
        {isError && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
};
