import { checkRecipeRateLimit } from "../_shared/rate-limit.ts";
import {
  fetchRecipeSuggestions,
  type RecipeSuggestResult,
  type RecipeSuggestion,
} from "./recipe.ts";
import { sanitizeItemNames } from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

export const toRecipeSuggestPayload = (
  result: RecipeSuggestResult,
): { recipes: RecipeSuggestion[]; reason?: "missing_api_key" | "missing_access_key" } => {
  if (result.kind === "missing_api_key") return { recipes: [], reason: "missing_api_key" };
  if (result.kind === "missing_access_key") return { recipes: [], reason: "missing_access_key" };
  if (result.kind === "error") return { recipes: [] };
  return { recipes: result.recipes };
};

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  // #834: lazy dynamic import (not a static top-level import) so importing
  // this module in tests doesn't require network access to esm.sh just to
  // resolve a handler that never reaches this line (e.g. preflight/auth
  // tests) — matches the pattern already used by subscribe-push/image-proxy.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const rateLimit = await checkRecipeRateLimit(supabase);
  if (!rateLimit.allowed) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  let body: { itemNames?: unknown };
  try {
    body = (await req.json()) as { itemNames?: unknown };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const itemNames = sanitizeItemNames(body.itemNames);
  if (itemNames.length === 0) {
    return json({ recipes: [] });
  }

  // This is a best-effort, optional suggestion feature layered on top of the
  // expiry banner — never surface a hard error to the client. Every failure
  // mode (no Rakuten credential configured, external API error, network error)
  // degrades to an empty recipe list with a 200 response instead of the
  // 4xx/5xx a client would need special-case handling for.
  const result = await fetchRecipeSuggestions(itemNames, {
    apiKey: Deno.env.get("RECIPE_API_KEY"),
    accessKey: Deno.env.get("RECIPE_ACCESS_KEY"),
  });

  return json(toRecipeSuggestPayload(result));
};

if (import.meta.main) Deno.serve(handler);
