import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { summarizeResults } from "./result.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// #630: Edge Functions can't use react-i18next, so notification copy is kept
// in a small static per-language map instead of hardcoding Japanese.
const NOTIFICATION_TEXT: Record<"ja" | "en", { title: string; body: string }> = {
  ja: { title: "テスト通知", body: "housekeeper の通知設定が正常に機能しています" },
  en: {
    title: "Test Notification",
    body: "Your housekeeper notification settings are working correctly",
  },
};

const isSupportedLanguage = (value: unknown): value is "ja" | "en" =>
  value === "ja" || value === "en";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  // Authenticate as the calling user via their own JWT (never the service
  // role) so a test send can only ever target that user's own subscriptions.
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

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error("VAPID secrets not configured");
    return new Response(JSON.stringify({ error: "Push notifications are not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("language")
    .eq("user_id", user.id)
    .maybeSingle();
  const language = isSupportedLanguage(userSettings?.language) ? userSettings.language : "ja";
  const { title: testNotificationTitle, body: testNotificationBody } = NOTIFICATION_TEXT[language];

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (subsError) {
    return new Response(JSON.stringify({ error: subsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const subscriptions = (subs ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return new Response(JSON.stringify({ error: "No push subscription found" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: testNotificationTitle, body: testNotificationBody }),
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          // Subscription expired — remove it, same as send-expiry-notifications.
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        throw err;
      }
    }),
  );

  const summary = summarizeResults(results);

  if (summary.allFailed) {
    console.error("Test notification failed for all subscriptions:", results);
    return new Response(JSON.stringify({ error: "Failed to send test notification" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, sent: summary.sent, failed: summary.failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
