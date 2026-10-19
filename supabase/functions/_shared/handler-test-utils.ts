// Shared helpers for Edge Function handler tests: fake Supabase env and a
// stubbed global fetch that answers the auth / rate-limit endpoints without
// any network access.

export interface StubOptions {
  /** `null` simulates an invalid session (auth.getUser fails). */
  user?: { id: string } | null;
  /** Response of the `check_*_rate_limit` RPC. */
  rateLimit?: { allowed: boolean; retry_after_seconds: number };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const withStubbedSupabase = async (
  options: StubOptions,
  fn: (calls: string[]) => Promise<void>,
): Promise<void> => {
  const { user = { id: "user-1" }, rateLimit = { allowed: true, retry_after_seconds: 0 } } =
    options;
  const originalFetch = globalThis.fetch;
  const originalUrl = Deno.env.get("SUPABASE_URL");
  const originalKey = Deno.env.get("SUPABASE_ANON_KEY");
  const calls: string[] = [];
  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    if (url.pathname === "/auth/v1/user") {
      return Promise.resolve(
        user
          ? jsonResponse({ id: user.id, aud: "authenticated", app_metadata: {}, user_metadata: {} })
          : jsonResponse({ message: "invalid JWT" }, 401),
      );
    }
    if (url.pathname.startsWith("/rest/v1/rpc/check_")) {
      return Promise.resolve(jsonResponse(rateLimit));
    }
    return Promise.reject(new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url.pathname}`));
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", originalUrl);
    if (originalKey === undefined) Deno.env.delete("SUPABASE_ANON_KEY");
    else Deno.env.set("SUPABASE_ANON_KEY", originalKey);
  }
};

export const postRequest = (body: BodyInit | null, authorized = true): Request =>
  new Request("https://example.test", {
    method: "POST",
    headers: authorized ? { Authorization: "Bearer test-token" } : {},
    body,
  });
