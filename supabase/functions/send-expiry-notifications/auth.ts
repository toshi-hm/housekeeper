export const isAuthorizedCronRequest = (
  req: Request,
  expectedSecret: string | undefined,
): boolean => {
  if (!expectedSecret) return false;
  const provided = req.headers.get("X-Cron-Secret");
  return provided === expectedSecret;
};
