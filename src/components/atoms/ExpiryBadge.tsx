import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { type ExpiryStatus, getExpiryStatus } from "@/types/item";

interface ExpiryBadgeProps {
  expiryDate: string | null | undefined;
  warningDays?: number;
}

const statusVariant: Record<ExpiryStatus, "destructive" | "warning" | "secondary" | "outline"> = {
  expired: "destructive",
  "expiring-soon": "warning",
  ok: "secondary",
  unknown: "outline",
};

const statusLabelKey = {
  expired: "expiryStatus.expired",
  "expiring-soon": "expiryStatus.expiring-soon",
  ok: "expiryStatus.ok",
  unknown: "expiryStatus.unknown",
} as const satisfies Record<ExpiryStatus, string>;

export const ExpiryBadge = ({ expiryDate, warningDays }: ExpiryBadgeProps) => {
  const { t } = useTranslation("items");
  const status = getExpiryStatus(expiryDate, warningDays);

  if (status === "unknown") return null;

  return <Badge variant={statusVariant[status]}>{t(statusLabelKey[status])}</Badge>;
};
