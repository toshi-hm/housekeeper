const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#14b8a6",
] as const;

interface ColorPickerProps {
  value: string | null | undefined;
  onChange: (color: string) => void;
}

export const ColorPicker = ({ value, onChange }: ColorPickerProps) => (
  <div className="flex flex-wrap gap-2">
    {PALETTE.map((color) => (
      <button
        key={color}
        type="button"
        aria-label={color}
        onClick={() => onChange(color)}
        className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
        style={{
          backgroundColor: color,
          borderColor: value === color ? "#000" : "transparent",
        }}
      />
    ))}
  </div>
);
