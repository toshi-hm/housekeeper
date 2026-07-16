import { createClient } from "jsr:@supabase/supabase-js@2";

import { checkRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT_SCOPE = "get-security-question";

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = (await req.json()) as { email?: unknown };

    if (typeof email !== "string" || !email) return json({ error: "email is required" }, 400);

    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // #433: throttle repeated lookups of the same email to prevent
    // brute-force / enumeration probing.
    const rateLimit = await checkRateLimit(supabase, RATE_LIMIT_SCOPE, normalizedEmail);
    if (!rateLimit.allowed) {
      return json({ error: "しばらく時間をおいて再度お試しください" }, 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const { data, error } = await supabase
      .from("user_security_questions")
      .select("question")
      .eq("email", normalizedEmail)
      .single();

    if (error || !data) {
      // Return null question instead of 404 to avoid email enumeration
      return json({ question: null });
    }

    return json({ question: data.question });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});
