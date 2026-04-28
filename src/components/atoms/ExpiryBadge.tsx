import { Badge } from "@/components/ui/badge";
import { type ExpiryStatus, getExpiryStatus } from "@/types/item";

interface ExpiryBadgeProps {
  expiryDate: string | null | undefined;
}

const statusConfig: Record<
  ExpiryStatus,
  { label: string; variant: "destructive" | "warning" | "secondary" | "outline" }
> = {
  expired: { label: "Expired", variant: "destructive" },
  "expiring-soon": { label: "Expiring soon", variant: "warning" },
  ok: { label: "Good", variant: "secondary" },
  unknown: { label: "No expiry", variant: "outline" },
};

export const ExpiryBadge = ({ expiryDate }: ExpiryBadgeProps) => {
  const status = getExpiryStatus(expiryDate);
  const { label, variant } = statusConfig[status];

  if (status === "unknown") return null;

  return <Badge variant={variant}>{label}</Badge>;
};
