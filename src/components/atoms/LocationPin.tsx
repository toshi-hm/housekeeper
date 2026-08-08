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
      // 可視サイズ（24〜28px）はそのまま、ヒットスロップで実質的な当たり判定を
      // 40px以上に広げる。ItemCardのクイックアクションボタンと同じパターン（#779）。
      // disabled（参考表示・onClickなし）のピンにはヒットスロップを付けない:
      // disabledなbuttonはclickイベント自体が発火せず親へバブリングもしないため、
      // ヒットスロップ分だけ「タップしても何も起きない」無音の死角が広がってしまう
      // （LocationPinPickerは写真コンテナ側のonClickでピン配置を行うため、参考
      // ピンの直上をタップされると配置操作ごと無効化されてしまう）。
      className="absolute -translate-x-1/2 -translate-y-full after:absolute after:-inset-2 after:content-[''] disabled:cursor-default disabled:after:hidden"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      onClick={onClick}
      // onClickが無いピン（他アイテムの参考表示など）は非インタラクティブとして
      // disabled にし、フォーカス可能だが何も起きない「動作しないボタン」を
      // キーボード/スクリーンリーダー利用者に見せないようにする（#699）。
      disabled={!onClick}
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
