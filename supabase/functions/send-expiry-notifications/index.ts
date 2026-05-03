import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPreference {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  threshold_days: number;
}

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface ExpiringItem {
  name: string;
  expiry_date: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_ADDRESS") ?? "housekeeper <noreply@example.com>";

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().split("T")[0];

  // Fetch all users with notifications enabled
  const { data: prefs, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("user_id, push_enabled, email_enabled, email_address, threshold_days")
    .or("push_enabled.eq.true,email_enabled.eq.true");

  if (prefsError) {
    console.error("Failed to fetch preferences:", prefsError);
    return new Response(JSON.stringify({ error: prefsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = await Promise.allSettled(
    (prefs as NotificationPreference[]).map(async (pref) => {
      // Calculate the threshold date
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + pref.threshold_days);
      const thresholdStr = thresholdDate.toISOString().split("T")[0];

      // Fetch expiring items for this user
      const { data: items } = await supabase
        .from("items")
        .select("name, expiry_date")
        .eq("user_id", pref.user_id)
        .not("expiry_date", "is", null)
        .lte("expiry_date", thresholdStr)
        .gte("expiry_date", today)
        .gt("units", 0);

      if (!items || items.length === 0) return;

      const count = (items as ExpiringItem[]).length;
      const title = `${count}件の食材が期限間近です`;
      const body = (items as ExpiringItem[])
        .slice(0, 3)
        .map((i) => `${i.name} (${i.expiry_date})`)
        .join(", ");

      // Send push notifications
      if (pref.push_enabled) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("user_id", pref.user_id);

        await Promise.allSettled(
          (subs as PushSubscription[]).map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify({ title, body }),
              );
            } catch (err: unknown) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 410 || status === 404) {
                // Subscription expired — remove it
                await supabase.from("push_subscriptions").delete().eq("id", sub.id);
              }
              console.error("Push failed:", err);
            }
          }),
        );
      }

      // Send email notifications via Resend
      if (pref.email_enabled && pref.email_address && resendApiKey) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: pref.email_address,
            subject: title,
            text: `期限間近の食材:\n${(items as ExpiringItem[]).map((i) => `- ${i.name} (${i.expiry_date})`).join("\n")}`,
          }),
        });
        if (!res.ok) {
          console.error("Email send failed:", await res.text());
        }
      }
    }),
  );

  const errors = results.filter((r) => r.status === "rejected");
  if (errors.length > 0) {
    console.error("Some notifications failed:", errors);
  }

  return new Response(
    JSON.stringify({ processed: (prefs as NotificationPreference[]).length, errors: errors.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
