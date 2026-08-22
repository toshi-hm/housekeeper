import { isAuthorized, isValidSubscribeBody } from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization")!;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody: unknown = await req.json();

  if (!isValidSubscribeBody(rawBody)) {
    return new Response(JSON.stringify({ error: "Invalid subscription body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const body = rawBody;

  if (body.action === "unsubscribe") {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", body.endpoint);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Same physical device/Service Worker registration shared across users
  // (e.g. a household tablet) makes `registration.pushManager.subscribe()`
  // return the identical `endpoint` for whoever subscribes on it. Uniqueness
  // is now scoped to (user_id, endpoint) rather than global (#826), so that
  // no longer conflicts by itself -- but a stale row from the *previous*
  // owner of this endpoint on this device is still a dead subscription: once
  // the new user's subscribe call overwrote the browser-side registration,
  // the old user's row can never be delivered to (and, worse, would keep
  // silently competing for delivery). RLS hides other users' rows from the
  // caller's own (anon-key + user JWT) client, so a service-role client is
  // required here to see and remove that stale row before upserting this
  // user's own row -- this is the same "act across users" escape hatch used
  // by verify-security-answer/get-security-question for admin-only lookups.
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { error: reassignError } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .neq("user_id", user.id);

  if (reassignError) {
    return new Response(JSON.stringify({ error: reassignError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Subscribe: upsert push subscription (isValidSubscribeBody already
  // guarantees `keys` is present here, since action !== "unsubscribe").
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys!.p256dh,
      auth: body.keys!.auth,
      user_agent: body.user_agent ?? req.headers.get("User-Agent") ?? null,
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  return new Response(JSON.stringify({ ok: true, vapid_public_key: vapidPublicKey }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

if (import.meta.main) Deno.serve(handler);
