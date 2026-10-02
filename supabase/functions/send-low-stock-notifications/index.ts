import { fetchAllPages } from "../_shared/pagination.ts";
import { isAuthorizedCronRequest } from "./auth.ts";
import { buildLowStockMessage, resolveLanguage } from "./content.ts";
import { zonedNow } from "./date.ts";
import { type LowStockRow, selectLowStockDailyGoods } from "./selection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface NotificationPreference {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  notify_at: string | null;
  timezone: string | null;
}

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isAuthorizedCronRequest(req, Deno.env.get("CRON_SECRET"))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service configuration is incomplete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const scheduled = new URL(req.url).searchParams.get("scheduled") === "true";
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_ADDRESS") ?? "housekeeper <noreply@example.com>";

  let prefs: NotificationPreference[];
  try {
    prefs = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("user_id, push_enabled, email_enabled, email_address, notify_at, timezone")
        .eq("low_stock_enabled", true)
        .or("push_enabled.eq.true,email_enabled.eq.true")
        .order("user_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as NotificationPreference[];
    });
  } catch (error) {
    console.error("Failed to fetch low-stock notification preferences:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch preferences" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = await Promise.allSettled(
    prefs.map(async (pref) => {
      const timezone = pref.timezone ?? "Asia/Tokyo";
      const local = zonedNow(timezone);
      if (scheduled) {
        const notifyHour = pref.notify_at ? parseInt(pref.notify_at.split(":")[0] ?? "8", 10) : 8;
        if (notifyHour !== local.hour) return;
      }

      let rows: LowStockRow[];
      try {
        rows = await fetchAllPages(async (from, to) => {
          const { data, error } = await supabase
            .from("items")
            .select(
              "id, name, units, minimum_stock, opened_remaining, deleted_at, item_type, categories(kind)",
            )
            .eq("user_id", pref.user_id)
            .is("deleted_at", null)
            .not("minimum_stock", "is", null)
            .order("id", { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as LowStockRow[];
        });
      } catch (error) {
        console.error("Failed to fetch items for user", pref.user_id, error);
        return;
      }

      const lowItems = selectLowStockDailyGoods(rows);
      const lowItemIds = new Set(lowItems.map((item) => item.id));
      const { data: previousStates, error: statesError } = await supabase
        .from("low_stock_notification_states")
        .select("item_id")
        .eq("user_id", pref.user_id);
      if (statesError) {
        console.error("Failed to read low-stock notification states", pref.user_id, statesError);
        return;
      }

      const recoveredIds = (previousStates ?? [])
        .map((row: { item_id: string }) => row.item_id)
        .filter((id: string) => !lowItemIds.has(id));
      if (recoveredIds.length > 0) {
        const { error } = await supabase
          .from("low_stock_notification_states")
          .delete()
          .eq("user_id", pref.user_id)
          .in("item_id", recoveredIds);
        if (error) {
          console.error("Failed to reset recovered low-stock states", pref.user_id, error);
          return;
        }
      }

      if (lowItems.length === 0) return;
      const previouslyNotified = new Set(
        (previousStates ?? []).map((row: { item_id: string }) => row.item_id),
      );
      const pendingItems = lowItems.filter((item) => !previouslyNotified.has(item.id));
      if (pendingItems.length === 0) return;

      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("language")
        .eq("user_id", pref.user_id)
        .maybeSingle();
      const language = resolveLanguage(userSettings?.language);

      // Claim item transitions before delivery so overlapping cron invocations cannot send twice.
      const claims = pendingItems.map((item) => ({
        user_id: pref.user_id,
        item_id: item.id,
        notified_at: new Date().toISOString(),
      }));
      const { data: claimedRows, error: claimError } = await supabase
        .from("low_stock_notification_states")
        .upsert(claims, { onConflict: "user_id,item_id", ignoreDuplicates: true })
        .select("item_id");
      if (claimError) {
        console.error("Failed to claim low-stock notification states", pref.user_id, claimError);
        return;
      }
      const claimedIds = (claimedRows ?? []).map((row: { item_id: string }) => row.item_id);
      if (claimedIds.length === 0) return;
      const claimedItems = pendingItems.filter((item) => claimedIds.includes(item.id));
      const message = buildLowStockMessage(
        language,
        claimedItems.map((item) => item.name),
        claimedItems.length,
      );

      let delivered = false;
      if (pref.push_enabled) {
        try {
          const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
          const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
          const vapidSubject = Deno.env.get("VAPID_SUBJECT");
          if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
            const { default: webpush } = await import("npm:web-push@3");
            webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
            const { data: subscriptions, error } = await supabase
              .from("push_subscriptions")
              .select("id, endpoint, p256dh, auth")
              .eq("user_id", pref.user_id);
            if (error) console.error("Failed to read push subscriptions", pref.user_id, error);
            for (const subscription of (subscriptions ?? []) as PushSubscription[]) {
              try {
                await webpush.sendNotification(
                  subscription,
                  JSON.stringify({
                    title: message.title,
                    body: message.body,
                    data: { url: "/?type=daily_goods" },
                  }),
                );
                delivered = true;
              } catch (error) {
                const statusCode =
                  typeof error === "object" && error !== null && "statusCode" in error
                    ? (error as { statusCode: number }).statusCode
                    : undefined;
                if (statusCode === 404 || statusCode === 410) {
                  await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
                } else {
                  console.error("Push delivery failed", pref.user_id, error);
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to prepare push delivery", pref.user_id, error);
        }
      }

      if (pref.email_enabled && pref.email_address && resendApiKey) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: resendFrom,
              to: [pref.email_address],
              subject: message.title,
              text: message.emailText,
            }),
          });
          if (!response.ok) throw new Error(`Resend returned ${response.status}`);
          delivered = true;
        } catch (error) {
          console.error("Email delivery failed", pref.user_id, error);
        }
      }

      if (!delivered) {
        const { error } = await supabase
          .from("low_stock_notification_states")
          .delete()
          .eq("user_id", pref.user_id)
          .in("item_id", claimedIds);
        if (error) console.error("Failed to release notification claims", pref.user_id, error);
      }
    }),
  );

  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) console.error("Some low-stock notifications failed:", failed);
  return new Response(JSON.stringify({ processed: prefs.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

if (import.meta.main) Deno.serve(handler);
