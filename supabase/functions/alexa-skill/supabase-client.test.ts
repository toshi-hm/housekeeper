import assert from "node:assert/strict";

import { getUserScopedSupabaseClient } from "./supabase-client.ts";

Deno.test("getUserScopedSupabaseClient validates the Alexa token and creates a user client", async () => {
  const seenAuthorizationHeaders: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    seenAuthorizationHeaders.push(request.headers.get("Authorization") ?? "");
    return Response.json({ id: "user-123", aud: "authenticated", role: "authenticated" });
  };

  const context = await getUserScopedSupabaseClient(
    "https://project.supabase.co",
    "anon-key",
    "valid-access-token",
    fetcher,
  );

  assert.ok(context);
  assert.strictEqual(context.userId, "user-123");
  assert.deepStrictEqual(seenAuthorizationHeaders, ["Bearer valid-access-token"]);
});

Deno.test("getUserScopedSupabaseClient rejects a token Auth does not recognize", async () => {
  const context = await getUserScopedSupabaseClient(
    "https://project.supabase.co",
    "anon-key",
    "invalid-access-token",
    async () => Response.json({ message: "Invalid JWT" }, { status: 401 }),
  );

  assert.strictEqual(context, null);
});
