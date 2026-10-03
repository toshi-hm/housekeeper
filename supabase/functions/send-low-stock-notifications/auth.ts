export const isAuthorizedCronRequest = (
  req: Request,
  expectedSecret: string | undefined,
): boolean => Boolean(expectedSecret) && req.headers.get("X-Cron-Secret") === expectedSecret;
