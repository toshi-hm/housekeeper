/** Pure auth/validation helpers extracted from index.ts for unit testing (#496). */

export interface SubscribeBody {
  action?: "unsubscribe";
  endpoint: string;
  keys?: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
}

/** Guards the 401 branch: a request must carry a non-empty Authorization header. */
export const isAuthorized = (req: Request): boolean => {
  const authHeader = req.headers.get("Authorization");
  return typeof authHeader === "string" && authHeader.trim().length > 0;
};

/**
 * Validates the parsed request body. `endpoint` is always required (it is
 * used as the delete/upsert key either way); `keys` (with `p256dh`/`auth`)
 * is additionally required unless this is an unsubscribe request.
 */
export const isValidSubscribeBody = (body: unknown): body is SubscribeBody => {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  if (typeof b.endpoint !== "string" || b.endpoint.trim().length === 0) return false;
  try {
    const endpoint = new URL(b.endpoint);
    if (endpoint.protocol !== "https:") return false;
  } catch {
    return false;
  }
  if (b.action !== undefined && b.action !== "unsubscribe") return false;

  if (b.action === "unsubscribe") return true;

  if (typeof b.keys !== "object" || b.keys === null) return false;
  const keys = b.keys as Record<string, unknown>;
  return (
    typeof keys.p256dh === "string" &&
    keys.p256dh.trim().length > 0 &&
    typeof keys.auth === "string" &&
    keys.auth.trim().length > 0
  );
};
