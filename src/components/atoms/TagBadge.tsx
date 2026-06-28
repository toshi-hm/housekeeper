import { X } from "lucide-react";

interface TagBadgeProps {
  name: string;
  color?: string | null;
  /** 指定すると削除ボタンを表示する */
  onRemove?: () => void;
  removeLabel?: string;
}

const DEFAULT_COLOR = "#6b7280";

export const TagBadge = ({ name, color, onRemove, removeLabel }: TagBadgeProps) => (
  <span
    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
    style={{
      borderColor: (color ?? DEFAULT_COLOR) + "66",
      backgroundColor: (color ?? DEFAULT_COLOR) + "1a",
      color: color ?? DEFAULT_COLOR,
    }}
  >
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? DEFAULT_COLOR }}
    />
    {name}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? `remove ${name}`}
        className="ml-0.5 rounded-full hover:bg-black/10"
      >
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);
