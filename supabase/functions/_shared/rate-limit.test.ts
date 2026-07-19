import assert from "node:assert/strict";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { checkChatRateLimit } from "./rate-limit.ts";

type RpcResult = { data: { allowed: boolean; retry_after_seconds: number } | null; error: unknown };

// Minimal stand-in for the subset of SupabaseClient used by checkChatRateLimit
// (supabase.rpc(fn, params).single()), so the RPC boundary itself can be
// exercised without a live database.
const makeFakeClient = (
  result: RpcResult,
  onRpc?: (fn: string, params: Record<string, unknown>) => void,
): SupabaseClient =>
  ({
    rpc: (fn: string, params: Record<string, unknown>) => {
      onRpc?.(fn, params);
      return { single: () => Promise.resolve(result) };
    },
  }) as unknown as SupabaseClient;

Deno.test("checkChatRateLimit - returns allowed when the RPC reports under the limit", async () => {
  const supabase = makeFakeClient({ data: { allowed: true, retry_after_seconds: 0 }, error: null });
  const result = await checkChatRateLimit(supabase);
  assert.deepStrictEqual(result, { allowed: true, retryAfterSeconds: 0 });
});

Deno.test("checkChatRateLimit - returns blocked with retry-after when over the limit", async () => {
  const supabase = makeFakeClient({
    data: { allowed: false, retry_after_seconds: 42 },
    error: null,
  });
  const result = await checkChatRateLimit(supabase);
  assert.deepStrictEqual(result, { allowed: false, retryAfterSeconds: 42 });
});

Deno.test("checkChatRateLimit - fails closed when the RPC returns an error", async () => {
  const supabase = makeFakeClient({ data: null, error: new Error("boom") });
  const result = await checkChatRateLimit(supabase, 20, 60);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.retryAfterSeconds, 60);
});

Deno.test("checkChatRateLimit - fails closed when the RPC returns no data", async () => {
  const supabase = makeFakeClient({ data: null, error: null });
  const result = await checkChatRateLimit(supabase, 20, 90);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.retryAfterSeconds, 90);
});

Deno.test("checkChatRateLimit - forwards max requests / window params to the RPC", async () => {
  let capturedFn: string | undefined;
  let capturedParams: Record<string, unknown> | undefined;
  const supabase = makeFakeClient(
    { data: { allowed: true, retry_after_seconds: 0 }, error: null },
    (fn, params) => {
      capturedFn = fn;
      capturedParams = params;
    },
  );
  await checkChatRateLimit(supabase, 5, 30);
  assert.strictEqual(capturedFn, "check_chat_rate_limit");
  assert.deepStrictEqual(capturedParams, { p_max_requests: 5, p_window_seconds: 30 });
});

Deno.test("checkChatRateLimit - uses default max requests / window when omitted", async () => {
  let capturedParams: Record<string, unknown> | undefined;
  const supabase = makeFakeClient(
    { data: { allowed: true, retry_after_seconds: 0 }, error: null },
    (_fn, params) => {
      capturedParams = params;
    },
  );
  await checkChatRateLimit(supabase);
  assert.deepStrictEqual(capturedParams, { p_max_requests: 20, p_window_seconds: 60 });
});
