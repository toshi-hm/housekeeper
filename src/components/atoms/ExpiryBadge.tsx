import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  type ExpirySeverity,
  type ExpiryType,
  getExpirySeverity,
  getExpiryStatus,
} from "@/types/item";

interface ExpiryBadgeProps {
  expiryDate: string | null | undefined;
  warningDays?: number;
  /** 「賞味期限」/「消費期限」の区別 (#714)。未設定なら従来通りの表示。 */
  expiryType?: ExpiryType | null;
}

const severityVariant: Record<ExpirySeverity, "destructive" | "warning" | "secondary" | "outline"> =
  {
    danger: "destructive",
    caution: "warning",
    warning: "warning",
    ok: "secondary",
    unknown: "outline",
  };

const severityLabelKey = {
  danger: "expiryStatus.expired",
  caution: "expiryStatus.expiredBestBefore",
  warning: "expiryStatus.expiring-soon",
  ok: "expiryStatus.ok",
  unknown: "expiryStatus.unknown",
} as const satisfies Record<ExpirySeverity, string>;

export const ExpiryBadge = ({ expiryDate, warningDays, expiryType }: ExpiryBadgeProps) => {
  const { t } = useTranslation("items");
  const status = getExpiryStatus(expiryDate, warningDays);
  const severity = getExpirySeverity(status, expiryType);

  if (status === "unknown") return null;

  return <Badge variant={severityVariant[severity]}>{t(severityLabelKey[severity])}</Badge>;
};
