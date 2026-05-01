import { useTranslation } from "react-i18next";

import { Select } from "@/components/ui/select";

interface LanguageToggleProps {
  value: string;
  onChange: (lang: string) => void;
}

export const LanguageToggle = ({ value, onChange }: LanguageToggleProps) => {
  const { t } = useTranslation("settings");
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="ja">{t("languageJa")}</option>
      <option value="en">{t("languageEn")}</option>
    </Select>
  );
};
