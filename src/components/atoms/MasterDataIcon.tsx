import { getMasterDataIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface MasterDataIconProps {
  /** lucide icon name stored on categories.icon / storage_locations.icon */
  icon?: string | null;
  className?: string;
}

/** Renders a category/storage location's icon next to its name. Renders
 *  nothing when no icon is set (or the stored name is no longer recognized),
 *  so callers can place it inline without extra conditionals. */
export const MasterDataIcon = ({ icon, className = "h-4 w-4" }: MasterDataIconProps) => {
  const Icon = getMasterDataIcon(icon);
  if (!Icon) return null;
  // Icon is one of a fixed, stable set of lucide components looked up by
  // name; it never wraps state, so remounting on `icon` change is harmless.
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={cn("shrink-0 text-muted-foreground", className)} aria-hidden="true" />;
};
