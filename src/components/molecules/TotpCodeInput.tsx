import { Input } from "@/components/ui/input";

interface TotpCodeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export const TotpCodeInput = ({
  id = "totpCode",
  value,
  onChange,
  autoFocus,
  disabled,
}: TotpCodeInputProps) => (
  <Input
    id={id}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]*"
    maxLength={6}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder="123456"
    autoFocus={autoFocus}
    disabled={disabled}
    className="text-center text-lg tracking-[0.5em]"
  />
);
