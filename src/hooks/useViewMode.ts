import { useCallback, useState } from "react";

export type ViewMode = "grid" | "list";

const STORAGE_KEY = "dashboard.viewMode";
const DEFAULT_VIEW_MODE: ViewMode = "grid";

const isViewMode = (value: string | null): value is ViewMode =>
  value === "grid" || value === "list";

const readStoredViewMode = (): ViewMode => {
  if (typeof window === "undefined") return DEFAULT_VIEW_MODE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
};

/**
 * ダッシュボードのグリッド/リスト表示切り替え状態を保持し、localStorageへ永続化する。
 * 次回アクセス時も選択した表示モードを維持する（#387）。
 */
export const useViewMode = () => {
  const [viewMode, setViewModeState] = useState<ViewMode>(readStoredViewMode);

  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return { viewMode, setViewMode };
};
