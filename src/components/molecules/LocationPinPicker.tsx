import { type KeyboardEvent, type MouseEvent, useRef } from "react";
import { useTranslation } from "react-i18next";

import { LocationPin } from "@/components/atoms/LocationPin";
import { Button } from "@/components/ui/button";

interface LocationPinPickerExistingPin {
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

/** キーボードでピンを移動する際の1回あたりの移動量（相対座標、0〜1のうち） */
const KEYBOARD_NUDGE_STEP = 0.02;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const ARROW_KEY_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -KEYBOARD_NUDGE_STEP],
  ArrowDown: [0, KEYBOARD_NUDGE_STEP],
  ArrowLeft: [-KEYBOARD_NUDGE_STEP, 0],
  ArrowRight: [KEYBOARD_NUDGE_STEP, 0],
};

/** 保管場所の写真をタップしてアイテムの収納位置（ピン）を指定する（#574）。
 *  位置指定は任意のため、常に「未設定に戻す」ボタンを併設する。
 *  キーボード操作: Enter/Space で中央にピンを置き、矢印キーで微調整する（#699）。 */
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
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    onChange({ x, y });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(value ?? { x: 0.5, y: 0.5 });
      return;
    }
    if (!value) return;
    const delta = ARROW_KEY_DELTAS[e.key];
    if (!delta) return;
    e.preventDefault();
    onChange({ x: clamp01(value.x + delta[0]), y: clamp01(value.y + delta[1]) });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("pinPickerHelp")}</p>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label={t("pinPickerAriaLabel")}
        className="relative w-full cursor-crosshair overflow-hidden rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
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
