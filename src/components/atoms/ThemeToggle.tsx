import { useTranslation } from "react-i18next";

import { Select } from "@/components/ui/select";
import { type Theme, useTheme } from "@/hooks/useTheme";

export const ThemeToggle = () => {
  const { t } = useTranslation("settings");
  const { theme, setTheme } = useTheme();
  return (
    <Select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
      <option value="system">{t("themeSystem")}</option>
      <option value="light">{t("themeLight")}</option>
      <option value="dark">{t("themeDark")}</option>
    </Select>
  );
};
