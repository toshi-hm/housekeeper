import { type MouseEvent, useRef } from "react";
import { useTranslation } from "react-i18next";

import { LocationPin } from "@/components/atoms/LocationPin";
import { Button } from "@/components/ui/button";

export interface LocationPinPickerExistingPin {
  id: string;
  x: number;
  y: number;
  label: string;
}

interface LocationPinPickerProps {
  photoUrl: string;
  /** 同じ保管場所に紐づく他アイテムのピン（参考表示、クリック不可） */
  existingPins?: LocationPinPickerExistingPin[];
  value: { x: number; y: number } | null;
  onChange: (value: { x: number; y: number } | null) => void;
}

/** 保管場所の写真をタップしてアイテムの収納位置（ピン）を指定する（#574）。
 *  位置指定は任意のため、常に「未設定に戻す」ボタンを併設する。 */
export const LocationPinPicker = ({
  photoUrl,
  existingPins = [],
  value,
  onChange,
}: LocationPinPickerProps) => {
  const { t } = useTranslation("items");
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange({ x, y });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("pinPickerHelp")}</p>
      <div
        ref={containerRef}
        className="relative w-full cursor-crosshair overflow-hidden rounded-lg border"
        onClick={handleClick}
      >
        <img src={photoUrl} alt="" className="block w-full select-none" draggable={false} />
        {existingPins.map((pin) => (
          <LocationPin key={pin.id} x={pin.x} y={pin.y} label={pin.label} />
        ))}
        {value && (
          <LocationPin x={value.x} y={value.y} label={t("pinPickerSelected")} variant="selected" />
        )}
      </div>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          {t("pinPickerClear")}
        </Button>
      )}
    </div>
  );
};
