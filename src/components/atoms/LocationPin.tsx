import { MapPin } from "lucide-react";

interface LocationPinProps {
  /** 写真上の相対位置（0〜1） */
  x: number;
  y: number;
  label: string;
  onClick?: () => void;
  variant?: "default" | "selected";
}

/** 保管場所の写真上にオーバーレイ表示するピン（#574）。`x`/`y` は写真の左上を
 *  基準にした 0〜1 の相対座標で、絶対配置の `left`/`top` パーセントに変換する。 */
export const LocationPin = ({ x, y, label, onClick, variant = "default" }: LocationPinProps) => {
  const isSelected = variant === "selected";

  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-full"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <MapPin
        className={
          isSelected
            ? "h-7 w-7 fill-primary text-primary drop-shadow"
            : "h-6 w-6 fill-orange-500 text-orange-700 drop-shadow"
        }
      />
    </button>
  );
};
