import { fetchAllPages } from "../_shared/pagination.ts";
import { isAuthorizedCronRequest } from "./auth.ts";
import { zonedNowHour } from "./date.ts";
import { buildWasteDigestMessage, resolveWasteDigestLanguage } from "./digestText.ts";
import {
  computeNextWasteStreak,
  shouldEvaluateWasteWeek,
  type WasteStreakState,
} from "./streak.ts";
import { computeWeeklyWasteDigest, targetWeekStartDateString } from "./weeklyDigest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface WasteDigestPreference {
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

interface WasteItemRow {
  name: string;
  deleted_at: string;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorizedCronRequest(req, Deno.env.get("CRON_SECRET"))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_ADDRESS") ?? "housekeeper <noreply@example.com>";

  // #834と同じ理由(lazy dynamic import)。プリフライト/cron認証テストなど、この行に
  // 到達しないテストで静的importが要求するネットワークアクセスを避ける。
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // send-expiry-notifications と同じ方針: pg_cron からの定期実行
  // (?scheduled=true, 毎週月曜に毎時実行)ではユーザーのnotify_atの「時」
  // (そのユーザーのtimezone基準)に一致する場合のみ送信し、対象週の重複評価を
  // waste_streaks.last_evaluated_week で防ぐ。手動呼び出しは即時送信する。
  const scheduled = new URL(req.url).searchParams.get("scheduled") === "true";

  let prefs: WasteDigestPreference[];
  try {
    prefs = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("user_id, push_enabled, email_enabled, email_address, notify_at, timezone")
        .eq("waste_digest_enabled", true)
        .order("user_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as WasteDigestPreference[];
    });
  } catch (error) {
    console.error("Failed to fetch preferences:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const targetWeekStart = targetWeekStartDateString(now);

  const results = await Promise.allSettled(
    prefs.map(async (pref) => {
      const timezone = pref.timezone ?? "Asia/Tokyo";

      if (scheduled) {
        const notifyHour = pref.notify_at ? parseInt(pref.notify_at.split(":")[0], 10) : 8;
        if (notifyHour !== zonedNowHour(timezone)) return;
      }

      // #925: 対象ユーザーの廃棄アイテム(items.deletion_reason = 'expired_waste')を
      // 全件取得する（useWasteStats/fetchAllWasteItemsと同じ方針。日付範囲での
      // 絞り込みはしない）。1件も無ければ「直近の消費ログが無い(新規ユーザー等)」
      // ケースとしてダイジェスト送信自体をスキップする(spec エラー処理節)。
      let wasteItems: WasteItemRow[];
      try {
        wasteItems = await fetchAllPages(async (from, to) => {
          const { data, error } = await supabase
            .from("items")
            .select("name, deleted_at")
            .eq("user_id", pref.user_id)
            .eq("deletion_reason", "expired_waste")
            .not("deleted_at", "is", null)
            .order("id", { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as WasteItemRow[];
        });
      } catch (error) {
        console.error("Failed to fetch waste items for user", pref.user_id, error);
        return;
      }

      if (wasteItems.length === 0) return;

      const { data: streakRow } = await supabase
        .from("waste_streaks")
        .select("current_streak_weeks, longest_streak_weeks, last_evaluated_week")
        .eq("user_id", pref.user_id)
        .maybeSingle();
      const prevStreak: WasteStreakState = {
        current_streak_weeks: streakRow?.current_streak_weeks ?? 0,
        longest_streak_weeks: streakRow?.longest_streak_weeks ?? 0,
      };
      const lastEvaluatedWeek: string | null = streakRow?.last_evaluated_week ?? null;

      // #827と同じ考え方: 定期実行時のみ、この対象週が既に評価済みなら
      // スキップする（重複評価防止）。手動呼び出しは常に評価・送信する。
      if (scheduled && !shouldEvaluateWasteWeek(lastEvaluatedWeek, targetWeekStart)) return;

      const digest = computeWeeklyWasteDigest(wasteItems, now);

      // ストリーク評価は週次バッチ実行時のみ・クライアント側では再計算しない
      // (spec「やらないこと」、複数デバイスでの二重カウント防止)。実送信の成否とは
      // 独立して更新する(通知チャネル未設定でも実際の廃棄行動の記録は継続する)。
      const nextStreak = computeNextWasteStreak(prevStreak, digest.currentWeekCount);
      const { error: streakError } = await supabase.from("waste_streaks").upsert({
        user_id: pref.user_id,
        current_streak_weeks: nextStreak.current_streak_weeks,
        longest_streak_weeks: nextStreak.longest_streak_weeks,
        last_evaluated_week: targetWeekStart,
      });
      if (streakError) {
        console.error("Failed to update waste_streaks for user", pref.user_id, streakError);
      }

      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("language")
        .eq("user_id", pref.user_id)
        .maybeSingle();
      const language = resolveWasteDigestLanguage(userSettings?.language);
      const message = buildWasteDigestMessage(language, {
        currentWeekCount: digest.currentWeekCount,
        changePercent: digest.changePercent,
        topWasted: digest.topWasted,
        streakWeeksAfterUpdate: nextStreak.current_streak_weeks,
      });

      // Send push notifications
      if (pref.push_enabled) {
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
        const vapidSubject = Deno.env.get("VAPID_SUBJECT");

        if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
          // #834と同じ理由(lazy dynamic import)。
          const { default: webpush } = await import("npm:web-push@3");
          webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

          const { data: subs, error: subsError } = await supabase
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("user_id", pref.user_id);

          if (subsError) {
            console.error("Failed to fetch push_subscriptions:", subsError);
          } else {
            await Promise.all(
              (subs as PushSubscription[]).map(async (sub) => {
                try {
                  await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    JSON.stringify({ title: message.title, body: message.body }),
                  );
                } catch (err: unknown) {
                  const status = (err as { statusCode?: number }).statusCode;
                  if (status === 410 || status === 404) {
                    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                  }
                  console.error("Push failed:", err);
                }
              }),
            );
          }
        } else {
          console.warn("VAPID secrets not configured, skipping push for user", pref.user_id);
        }
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
            subject: message.emailSubject,
            text: message.emailBody,
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
    console.error("Some waste digests failed:", errors);
  }

  return new Response(
    JSON.stringify({
      processed: prefs.length,
      errors: errors.length,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
};

if (import.meta.main) Deno.serve(handler);
