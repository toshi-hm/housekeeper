interface ColorDotProps {
  color?: string | null;
  className?: string;
}

export const ColorDot = ({ color, className = "h-2.5 w-2.5" }: ColorDotProps) => (
  <span
    className={`inline-block shrink-0 rounded-full ${className}`}
    style={{ backgroundColor: color ?? "#6b7280" }}
  />
);
