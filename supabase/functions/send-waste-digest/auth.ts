// send-expiry-notifications/auth.ts と同一のCRON_SECRET認証パターン。
// _shared/ に汎用のcron認証ヘルパーは無いため(2026-09時点)、既存の慣習どおり
// Edge Function単位で複製する。
export const isAuthorizedCronRequest = (
  req: Request,
  expectedSecret: string | undefined,
): boolean => {
  if (!expectedSecret) return false;
  const provided = req.headers.get("X-Cron-Secret");
  return provided === expectedSecret;
};
