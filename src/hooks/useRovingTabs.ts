import { type KeyboardEvent, useRef } from "react";

/**
 * WAI-ARIA Authoring Practices の tabs パターン（#632）に沿った、矢印キー・
 * Home・Endでのタブ間フォーカス移動（roving tabindex）を提供する共通フック。
 *
 * - `getTabProps(tab)` を各タブボタンに spread する: `tabIndex` は選択中のタブ
 *   のみ `0`、他は `-1`（Tabキーはタブリスト自体を1回でスキップし、矢印キーで
 *   タブ間を移動する、というAPGの標準挙動）。
 * - `tablistProps` をタブリストのコンテナ（`role="tablist"`の要素）に spread
 *   する。矢印キー押下時はアクティブタブを切り替え、対応するタブボタンへ
 *   フォーカスを移動する。
 *
 * `tabs` は現在実際に表示されているタブのIDを表示順に渡す（条件付きで一部の
 * タブが非表示になる場合、呼び出し側でその時点の可視リストを渡すこと）。
 */
export const useRovingTabs = <T extends string>(
  tabs: readonly T[],
  activeTab: T,
  setActiveTab: (tab: T) => void,
) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusTab = (tab: T) => {
    requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLElement>(`[data-roving-tab="${tab}"]`)?.focus();
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex: number | null = null;

    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === null) return;
    e.preventDefault();
    const nextTab = tabs[nextIndex]!;
    setActiveTab(nextTab);
    focusTab(nextTab);
  };

  const getTabProps = (tab: T) => ({
    "data-roving-tab": tab,
    tabIndex: tab === activeTab ? 0 : -1,
  });

  return {
    tablistProps: { ref: containerRef, onKeyDown: handleKeyDown },
    getTabProps,
  };
};
