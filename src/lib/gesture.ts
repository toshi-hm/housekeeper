/**
 * タッチジェスチャ（プル更新・スワイプアクション）の純粋な判定ロジック。
 * DOM・React に依存しないため単体テストできる。
 */

/** プル更新が発火する引っ張り距離（減衰後, px） */
export const PULL_THRESHOLD = 64;
/** プル量の上限（減衰後, px） */
export const PULL_MAX = 112;
/** 指の移動量に対するプル量の比率（ゴムのような抵抗感） */
const PULL_RESISTANCE = 0.5;

/** スワイプアクションが確定する横移動量（px） */
export const SWIPE_THRESHOLD = 72;
/** スワイプ行の最大移動量（px） */
export const SWIPE_MAX = 112;
/** これ未満の移動はタップとみなし、スワイプとして扱わない（px） */
export const SWIPE_TAP_SLOP = 8;

export type SwipeDirection = "left" | "right";

/** 指の縦移動量 → 画面に表示するプル量。下方向のみ有効で、抵抗と上限を掛ける。 */
export const dampenPull = (deltaY: number): number => {
  if (!Number.isFinite(deltaY) || deltaY <= 0) return 0;
  return Math.min(PULL_MAX, deltaY * PULL_RESISTANCE);
};

export const isPullReady = (pullDistance: number): boolean => pullDistance >= PULL_THRESHOLD;

/**
 * タッチ移動が縦方向のプルか横方向のスワイプかを判定する。
 * 斜めの動きは移動量の大きい軸を採用する。タップ程度の移動は undefined（未確定）。
 */
export const detectAxis = (dx: number, dy: number): "x" | "y" | undefined => {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_TAP_SLOP) return undefined;
  return ax > ay ? "x" : "y";
};

/**
 * 横移動量を行の表示オフセットへ変換する。有効な方向（アクションがある側）
 * だけ動かし、上限を超えた分は切り詰める。
 */
export const clampSwipe = (dx: number, enabled: { left: boolean; right: boolean }): number => {
  if (dx < 0) return enabled.left ? Math.max(-SWIPE_MAX, dx) : 0;
  if (dx > 0) return enabled.right ? Math.min(SWIPE_MAX, dx) : 0;
  return 0;
};

/** 指を離した時点のオフセットから、確定するスワイプ方向を返す（未達なら null）。 */
export const resolveSwipe = (offset: number): SwipeDirection | null => {
  if (offset <= -SWIPE_THRESHOLD) return "left";
  if (offset >= SWIPE_THRESHOLD) return "right";
  return null;
};
