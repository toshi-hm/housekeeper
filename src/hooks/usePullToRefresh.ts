import { type RefObject, useEffect, useRef, useState } from "react";

import { dampenPull, detectAxis, isPullReady, PULL_THRESHOLD } from "@/lib/gesture";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown>;
  /** true の間はジェスチャを無効にする（選択モード中など） */
  disabled?: boolean;
}

interface UsePullToRefreshResult {
  containerRef: RefObject<HTMLDivElement | null>;
  /** 画面に表示するプル量（px） */
  pullDistance: number;
  isRefreshing: boolean;
  /** 離すと更新が走る位置まで引っ張られているか */
  isReady: boolean;
}

/**
 * ページ最上部で下に引っ張って更新するジェスチャ。タッチ操作のみが対象で、
 * マウス・キーボード利用者向けには呼び出し側が更新ボタンなどの代替を用意する。
 * ブラウザ標準のプル更新（リロード）と競合しないよう、引っ張り中は
 * touchmove を non-passive で受けてスクロールを抑止する。
 */
export const usePullToRefresh = ({
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    let startX: number | null = null;
    let startY: number | null = null;
    let axis: "x" | "y" | undefined;

    const setPull = (value: number) => {
      pullRef.current = value;
      setPullDistance(value);
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (refreshingRef.current || e.touches.length !== 1 || !touch || window.scrollY > 0) {
        startX = null;
        startY = null;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      axis = undefined;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (startY === null || startX === null || !touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      axis ??= detectAxis(dx, dy);
      if (axis !== "y") return;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) setPull(0);
        return;
      }
      // 引っ張り中にページ本体がスクロール/リロードされないようにする
      if (e.cancelable) e.preventDefault();
      setPull(dampenPull(dy));
    };

    const onTouchEnd = () => {
      const shouldRefresh = startY !== null && isPullReady(pullRef.current);
      startX = null;
      startY = null;
      axis = undefined;
      if (!shouldRefresh) {
        setPull(0);
        return;
      }
      refreshingRef.current = true;
      setIsRefreshing(true);
      setPull(PULL_THRESHOLD);
      void Promise.resolve(onRefreshRef.current())
        .catch(() => {
          // 取得エラーは各クエリ側（errorState / retry）で表示されるためここでは握りつぶす
        })
        .finally(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
          setPull(0);
        });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled]);

  return { containerRef, pullDistance, isRefreshing, isReady: isPullReady(pullDistance) };
};
