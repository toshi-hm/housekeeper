import { useCallback, useEffect, useState } from "react";

import { safeGetItem, safeSetItem } from "@/lib/safeStorage";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark" || value === "system";

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", isDark);
};

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = safeGetItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    safeSetItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
};
