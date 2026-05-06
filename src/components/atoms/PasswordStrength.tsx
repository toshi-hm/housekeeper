interface PasswordStrengthProps {
  password: string;
}

const PasswordStrength = ({ password }: PasswordStrengthProps) => {
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
        {checks.length ? "✓" : "✗"} 8文字以上
      </li>
      <li className={typeCount >= 3 ? "text-green-600" : "text-destructive"}>
        {typeCount >= 3 ? "✓" : "✗"} 大文字・小文字・数字・記号のうち3種類以上（現在: {typeCount}
        種類）
      </li>
    </ul>
  );
};

export { PasswordStrength };
