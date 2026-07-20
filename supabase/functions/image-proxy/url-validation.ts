/** Pure auth/URL/content-type validation helpers extracted from index.ts for unit testing (#496). */

export const ALLOWED_HOSTS = [/^([a-z0-9-]+\.)+yimg\.jp$/, /^shopping\.yahoo\.co\.jp$/];

export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const GENERIC_CONTENT_TYPES = ["application/octet-stream", "binary/octet-stream"];

export const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export class UnsafeRedirectError extends Error {}

export interface AllowedFetchResult {
  response: Response;
  finalUrl: URL;
}

/** Guards the 401 branch: a request must carry a non-empty Authorization header. */
export const isAuthorized = (req: Request): boolean => {
  const authHeader = req.headers.get("Authorization");
  return typeof authHeader === "string" && authHeader.trim().length > 0;
};

export const isAllowedHost = (hostname: string): boolean =>
  ALLOWED_HOSTS.some((pattern) => pattern.test(hostname));

export const isAllowedUrl = (url: URL): boolean =>
  url.protocol === "https:" && isAllowedHost(url.hostname);

/**
 * Follow redirects manually and validate each Location before issuing the
 * next request. Validating only Response.url is too late: fetch has already
 * contacted a potentially private/disallowed redirect target by then.
 */
export const fetchAllowedUrl = async (
  initialUrl: URL,
  fetcher: typeof fetch = fetch,
): Promise<AllowedFetchResult> => {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetcher(currentUrl, { redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return { response, finalUrl: currentUrl };

    const location = response.headers.get("Location");
    if (!location) throw new UnsafeRedirectError("Redirect is missing Location");
    const nextUrl = new URL(location, currentUrl);
    if (!isAllowedUrl(nextUrl)) throw new UnsafeRedirectError("Redirect to disallowed host");
    currentUrl = nextUrl;
  }
  throw new UnsafeRedirectError("Too many redirects");
};

export const inferContentTypeFromPath = (path: string): string | null => {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  return null;
};

export const getMatchedTypeFromHeader = (contentType: string): string | null => {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_CONTENT_TYPES.find((t) => normalized === t) ?? null;
};

export const canInferContentTypeFromPath = (contentType: string): boolean => {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return !normalized || GENERIC_CONTENT_TYPES.includes(normalized);
};
