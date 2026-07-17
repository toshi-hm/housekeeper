import { getMasterDataIcon, MASTER_DATA_ICON_NAMES } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value: string | null | undefined;
  onChange: (icon: string | null) => void;
}

/** Grid of selectable lucide icons for category/storage location `icon`.
 *  Clicking the currently selected icon clears the selection. */
export const IconPicker = ({ value, onChange }: IconPickerProps) => (
  <div className="flex flex-wrap gap-2">
    {MASTER_DATA_ICON_NAMES.map((name) => {
      const Icon = getMasterDataIcon(name);
      if (!Icon) return null;
      const selected = value === name;
      return (
        <button
          key={name}
          type="button"
          aria-label={name}
          aria-pressed={selected}
          onClick={() => onChange(selected ? null : name)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            selected && "border-primary bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      );
    })}
  </div>
);
