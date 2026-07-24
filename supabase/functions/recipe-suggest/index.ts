import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { fetchRecipeSuggestions } from "./recipe.ts";
import { sanitizeItemNames } from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
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
  // mode (no RECIPE_API_KEY configured, external API error, network error)
  // degrades to an empty recipe list with a 200 response instead of the
  // 4xx/5xx a client would need special-case handling for.
  const result = await fetchRecipeSuggestions(itemNames, {
    apiKey: Deno.env.get("RECIPE_API_KEY"),
    baseUrl: Deno.env.get("RECIPE_API_BASE_URL"),
  });

  if (result.kind === "missing_key") {
    return json({ recipes: [], reason: "missing_api_key" });
  }
  if (result.kind === "error") {
    return json({ recipes: [] });
  }
  return json({ recipes: result.recipes });
});
