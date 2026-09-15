import { type NotificationPreferenceRow, planTestChannels } from "./channelPlan.ts";
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
  // #834: lazy dynamic import (not a static top-level import) so importing
  // this module in tests doesn't require network access to esm.sh just to
  // resolve a handler that never reaches this line (e.g. preflight/auth
  // tests) — matches the pattern already used by subscribe-push/image-proxy.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
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

  // #1063: which channel(s) to test depends on the user's own preferences —
  // previously this endpoint only ever attempted push, so a user who only
  // enabled email notifications had no way to verify their settings worked.
  const { data: prefsRow } = await supabase
    .from("notification_preferences")
    .select("push_enabled, email_enabled, email_address")
    .eq("user_id", user.id)
    .maybeSingle();
  const prefs = prefsRow as NotificationPreferenceRow | null;
  const plan = planTestChannels(prefs);

  if (!plan.sendPush && !plan.sendEmail) {
    return new Response(JSON.stringify({ error: "No notification channel enabled" }), {
      status: 400,
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

  let pushSummary: { sent: number; failed: number } | null = null;
  let pushError: string | null = null;

  if (plan.sendPush) {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      console.error("VAPID secrets not configured");
      pushError = "Push notifications are not configured";
    } else {
      const { data: subs, error: subsError } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", user.id);

      if (subsError) {
        pushError = subsError.message;
      } else {
        const subscriptions = (subs ?? []) as PushSubscriptionRow[];
        if (subscriptions.length === 0) {
          pushError = "No push subscription found";
        } else {
          // #834: lazy dynamic import — this package (via http_ece) reads
          // process.env.ECE_KEYLOG at module top level, which would require
          // --allow-env just to import this module in tests (e.g.
          // preflight/auth tests that never reach this line). A static
          // top-level import would fail in real CI too, since `deno test`
          // there runs without --allow-env.
          const { default: webpush } = await import("npm:web-push@3");
          webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

          const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  // #671: テスト通知は通知設定画面から送るものなので、タップ後も
                  // その画面に戻すのが自然（対象アイテムは無いため sw.ts の
                  // 既定値 "/" ではなく明示する）。
                  JSON.stringify({
                    title: testNotificationTitle,
                    body: testNotificationBody,
                    data: { url: "/settings" },
                  }),
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
          pushSummary = { sent: summary.sent, failed: summary.failed };
          if (summary.allFailed) {
            console.error("Test push notification failed for all subscriptions:", results);
            pushError = "Failed to send test push notification";
          }
        }
      }
    }
  }

  let emailSent = false;
  let emailError: string | null = null;

  if (plan.sendEmail) {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_ADDRESS") ?? "housekeeper <noreply@example.com>";
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      emailError = "Email notifications are not configured";
    } else {
      // prefs.email_address is non-null here — planTestChannels only sets
      // sendEmail when it is.
      const emailAddress = prefs?.email_address as string;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: emailAddress,
          subject: testNotificationTitle,
          text: testNotificationBody,
        }),
      });
      if (res.ok) {
        emailSent = true;
      } else {
        const responseText = await res.text();
        console.error("Test email send failed:", responseText);
        emailError = "Failed to send test email";
      }
    }
  }

  const pushSucceeded = !!pushSummary && pushSummary.sent > 0;
  if (!pushSucceeded && !emailSent) {
    const errors = [pushError, emailError].filter((message): message is string => !!message);
    return new Response(
      JSON.stringify({ error: errors.join(" / ") || "Failed to send test notification" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      push: pushSummary ? { sent: pushSummary.sent, failed: pushSummary.failed } : undefined,
      email: plan.sendEmail ? { sent: emailSent } : undefined,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
};

if (import.meta.main) Deno.serve(handler);
