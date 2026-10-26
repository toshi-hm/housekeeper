import { type ReactNode, type TouchEvent, useRef, useState } from "react";

import { clampSwipe, detectAxis, resolveSwipe, SWIPE_TAP_SLOP } from "@/lib/gesture";
import { cn } from "@/lib/utils";

interface SwipeAction {
  /** スワイプ中に背景へ表示するラベル（アイコンと併記） */
  label: string;
  icon?: ReactNode;
  onTrigger: () => void;
  /** 背景色などの tailwind クラス */
  className?: string;
}

interface SwipeableRowProps {
  /** 右へスワイプしたときのアクション（背景は左側に表示） */
  rightAction?: SwipeAction;
  /** 左へスワイプしたときのアクション（背景は右側に表示） */
  leftAction?: SwipeAction;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * 行を横にスワイプしてアクションを実行する（タッチ操作の近道）。
 * 同じ操作は必ず行内のボタン等でも行えること（スワイプはキーボード・スクリーンリーダー
 * から到達できないため、あくまで補助）。確定後は元の位置に戻る。
 */
export const SwipeableRow = ({
  rightAction,
  leftAction,
  disabled = false,
  children,
  className,
}: SwipeableRowProps) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | undefined>(undefined);
  const swiped = useRef(false);

  const enabled = { left: !!leftAction, right: !!rightAction };
  const active = !disabled && (enabled.left || enabled.right);

  if (!active) return <div className={className}>{children}</div>;

  const reset = () => {
    start.current = null;
    axis.current = undefined;
    setDragging(false);
    setOffset(0);
  };

  const onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || e.touches.length !== 1) return;
    start.current = { x: touch.clientX, y: touch.clientY };
    axis.current = undefined;
    swiped.current = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || !start.current) return;
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;
    axis.current ??= detectAxis(dx, dy);
    if (axis.current !== "x") return;
    setDragging(true);
    setOffset(clampSwipe(dx, enabled));
  };

  const onTouchEnd = () => {
    const direction = axis.current === "x" ? resolveSwipe(offset) : null;
    // タップ程度の移動は後続の click を妨げない。スワイプした場合のみ click を握りつぶす。
    swiped.current = Math.abs(offset) >= SWIPE_TAP_SLOP;
    reset();
    if (direction === "left") leftAction?.onTrigger();
    if (direction === "right") rightAction?.onTrigger();
  };

  const shown = offset > 0 ? rightAction : offset < 0 ? leftAction : undefined;

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)} data-swipeable="true">
      {shown && (
        <div
          aria-hidden="true"
          data-testid="swipe-action-background"
          className={cn(
            "absolute inset-0 flex items-center gap-2 px-4 text-sm font-medium text-white",
            offset > 0 ? "justify-start" : "justify-end",
            shown.className ?? "bg-primary",
          )}
        >
          {shown.icon}
          <span>{shown.label}</span>
        </div>
      )}
      <div
        // 縦スクロールはブラウザに任せ、横方向のジェスチャだけをこの行で扱う
        className="relative touch-pan-y bg-background"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={reset}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
};
