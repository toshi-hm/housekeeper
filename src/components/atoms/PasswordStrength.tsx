import { useTranslation } from "react-i18next";

interface PasswordStrengthProps {
  password: string;
}

const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  const { t } = useTranslation("auth");

  if (!password) return null;

  const checks = {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]/.test(password),
  };
  const typeCount = [checks.lower, checks.upper, checks.number, checks.symbol].filter(
    Boolean,
  ).length;

  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      <li className={checks.length ? "text-green-600" : "text-destructive"}>
        {checks.length ? "✓" : "✗"} {t("passwordMinLength")}
      </li>
      <li className={typeCount >= 3 ? "text-green-600" : "text-destructive"}>
        {typeCount >= 3 ? "✓" : "✗"} {t("passwordComplexity", { count: typeCount })}
      </li>
    </ul>
  );
};

export { PasswordStrength };
