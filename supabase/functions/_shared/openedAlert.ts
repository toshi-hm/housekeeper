// Mirrors src/types/item.ts's resolveOpenedAlertThresholdDays / getElapsedDays /
// isOpenedAlertDue for the Deno Edge Function runtime (which can't import
// client-side TS directly). Ported for #967 so send-expiry-notifications can
// detect "opened but past the recommended use-after-opening threshold" items,
// the same condition src/components/atoms/OpenedAlertBadge.tsx surfaces
// client-side.

export interface OpenedAlertThresholdInput {
  days_use_after_opening: number | null;
}

/**
 * 開封後使用推奨日数の有効値を解決する。アイテム個別の設定が優先され、
 * 未設定ならカテゴリの既定値にフォールバックする。どちらも未設定なら
 * `null`（開封後アラート機能自体を使わない）。
 */
export const resolveOpenedAlertThresholdDays = (
  item: OpenedAlertThresholdInput,
  category?: OpenedAlertThresholdInput | null,
): number | null => item.days_use_after_opening ?? category?.days_use_after_opening ?? null;

/** `since` から `now` までの経過日数（切り捨て）。無効な日付文字列なら `null`。 */
export const getElapsedDays = (
  since: string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!since) return null;
  const sinceMs = new Date(since).getTime();
  if (Number.isNaN(sinceMs)) return null;
  return Math.floor((now.getTime() - sinceMs) / (1000 * 60 * 60 * 24));
};

/**
 * 開封後アラートの対象とすべきか判定する純関数。`openedAt`（開封日時）と
 * 有効な推奨日数がともに設定されていて、経過日数がその日数以上であれば
 * `true`。未開封（`openedAt` が null）や推奨日数が未設定（`thresholdDays` が
 * null）の場合は常に `false`。
 */
export const isOpenedAlertDue = (
  openedAt: string | null | undefined,
  thresholdDays: number | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!thresholdDays) return false;
  const elapsedDays = getElapsedDays(openedAt, now);
  return elapsedDays !== null && elapsedDays >= thresholdDays;
};
