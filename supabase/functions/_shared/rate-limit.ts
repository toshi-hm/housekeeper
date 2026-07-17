import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Brute-force protection helper for the password reset (secret question)
 * flow (#433). Backed by the `check_security_reset_rate_limit` Postgres
 * function, which atomically tracks attempts per (scope, identifier) and
 * applies an exponential-backoff lockout once too many attempts are made
 * within a rolling window.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export const checkRateLimit = async (
  supabase: SupabaseClient,
  scope: string,
  identifier: string,
): Promise<RateLimitResult> => {
  const { data, error } = await supabase
    .rpc("check_security_reset_rate_limit", {
      p_scope: scope,
      p_identifier: identifier,
    })
    .single<{ allowed: boolean; retry_after_seconds: number }>();

  if (error || !data) {
    // Fail closed: if the rate-limit check itself is broken, don't let the
    // request bypass throttling entirely.
    console.error("rate limit check failed", error);
    return { allowed: false, retryAfterSeconds: 60 };
  }

  return { allowed: data.allowed, retryAfterSeconds: data.retry_after_seconds };
};

/** Constant-time string comparison to avoid leaking hash match info via timing. */
export const timingSafeEqual = async (a: string, b: string): Promise<boolean> => {
  const { timingSafeEqual: nodeTimingSafeEqual } = await import("node:crypto");
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // node:crypto's timingSafeEqual requires equal-length buffers; unequal
  // lengths can never match, and comparing fixed-length hashes here is safe
  // to short-circuit on since the length itself is not secret (both are
  // hex-encoded SHA-256 digests of a known fixed length).
  if (aBytes.length !== bBytes.length) return false;
  return nodeTimingSafeEqual(aBytes, bBytes);
};
