import { useState } from "react";

import { ColorDot } from "@/components/atoms/ColorDot";
import { cn } from "@/lib/utils";
import type { Item } from "@/types/item";

interface ExpiryCheckItemProps {
  item: Item;
  categoryColor?: string | null;
  onCheck: (id: string) => void;
}

export const ExpiryCheckItem = ({ item, categoryColor, onCheck }: ExpiryCheckItemProps) => {
  const [checked, setChecked] = useState(false);

  const handleChange = () => {
    if (checked) return;
    setChecked(true);
    onCheck(item.id);
  };

  const expiryLabel = item.expiry_date
    ? new Date(item.expiry_date).toLocaleDateString("ja-JP", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <label className="flex cursor-pointer items-center gap-2 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="h-4 w-4 shrink-0 accent-primary"
        aria-label={item.name}
      />
      <ColorDot color={categoryColor} />
      <span
        className={cn(
          "flex-1 truncate text-sm",
          checked && "text-muted-foreground line-through",
        )}
      >
        {item.name}
      </span>
      {expiryLabel && (
        <span className={cn("shrink-0 text-xs text-muted-foreground", checked && "line-through")}>
          {expiryLabel}
        </span>
      )}
    </label>
  );
};
