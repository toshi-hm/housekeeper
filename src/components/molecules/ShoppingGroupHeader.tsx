import { ColorDot } from "@/components/atoms/ColorDot";

interface ShoppingGroupHeaderProps {
  /** カテゴリ名。未分類グループのときは null */
  name: string | null;
  color?: string | null;
  count: number;
  /** 未分類グループに表示するラベル（例: 「その他」） */
  otherLabel: string;
}

export const ShoppingGroupHeader = ({
  name,
  color,
  count,
  otherLabel,
}: ShoppingGroupHeaderProps) => (
  <div className="flex items-center gap-2 pt-2 pb-1">
    <ColorDot color={name === null ? "#9ca3af" : color} className="h-3 w-3" />
    <h3 className="text-sm font-semibold text-foreground">{name ?? otherLabel}</h3>
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
  </div>
);
