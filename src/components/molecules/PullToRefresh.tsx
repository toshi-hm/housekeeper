import { ArrowDown } from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PULL_THRESHOLD } from "@/lib/gesture";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  /** 更新処理。解決するまでインジケータを表示し続ける。 */
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * 子要素をラップし、タッチで下に引っ張ると `onRefresh` を呼ぶ（プル更新）。
 * ジェスチャは補助的な操作で、同じ更新は画面の再読み込みでも行える。
 */
export const PullToRefresh = ({ onRefresh, disabled, children, className }: PullToRefreshProps) => {
  const { t } = useTranslation("common");
  const { containerRef, pullDistance, isRefreshing, isReady } = usePullToRefresh({
    onRefresh,
    disabled,
  });
  const visible = pullDistance > 0 || isRefreshing;
  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <div ref={containerRef} className={className}>
      <div
        aria-live="polite"
        data-testid="pull-to-refresh-indicator"
        className="flex items-center justify-center gap-2 overflow-hidden text-xs text-muted-foreground"
        style={{
          height: pullDistance,
          // 引っ張り中は指に追従させ、離したときだけ滑らかに戻す
          transition: pullDistance === 0 || isRefreshing ? "height 200ms ease-out" : "none",
        }}
      >
        {visible && (
          <>
            {isRefreshing ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <ArrowDown
                aria-hidden="true"
                className={cn("h-4 w-4 transition-transform", isReady && "rotate-180")}
                style={{ opacity: progress }}
              />
            )}
            <span>
              {isRefreshing
                ? t("pullToRefreshRefreshing")
                : isReady
                  ? t("pullToRefreshRelease")
                  : t("pullToRefreshPull")}
            </span>
          </>
        )}
      </div>
      {children}
    </div>
  );
};
