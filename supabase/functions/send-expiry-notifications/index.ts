import { fetchAllPages } from "../_shared/pagination.ts";
import { type ItemType, resolveItemType } from "../_shared/itemType.ts";
import { isAuthorizedCronRequest } from "./auth.ts";
import { zonedDateString, zonedNow } from "./date.ts";
import { shouldClaimNotificationSlot, wasAnyPushDelivered } from "./deliveryClaim.ts";
import { buildNotificationTargetUrl } from "./notificationUrl.ts";

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
  threshold_days: number;
  notify_at: string | null;
  timezone: string | null;
}

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

type ExpiryType = "best_before" | "use_by" | null;

interface ExpiringItem {
  id: string;
  name: string;
  expiry_date: string;
  // #714: 「賞味期限」(品質の目安) と「消費期限」(安全性の目安) の区別。
  // null = 未設定（区別なし、既存アイテム）で従来通りの一律の通知文言のまま扱う。
  expiry_type: ExpiryType;
  // #937: 実効種別（食料品/日用品）を解決するための元データ。カテゴリを後から
  // 日用品へ切り替えた既存アイテムは expiry_date が DB に残ったままになるため、
  // 通知対象からは除外する（ダッシュボード側の dropExpiryForDailyGoods と同様）。
  item_type: ItemType | null;
  categories: { kind: ItemType | null } | null;
}

// #630: Edge Functions can't use react-i18next, so notification copy is kept
// in a small static per-language map instead of hardcoding Japanese.
// #714: title()/itemLine() take expiry_type-aware inputs so wording/priority
// can reflect 賞味期限 (best-before, mild) vs 消費期限 (use-by, urgent) without
// touching the hour-matching / scheduling logic above (kept untouched to avoid
// conflicting with #708, which is also editing this file).
const EXPIRY_NOTIFICATION_TEXT: Record<
  "ja" | "en",
  {
    title: (count: number, hasUrgent: boolean) => string;
    itemLine: (name: string, expiryDate: string, expiryType: ExpiryType) => string;
    emailIntro: string;
  }
> = {
  ja: {
    // 消費期限（安全性）を含む場合は従来通りの表現、賞味期限のみなら穏やかな表現にする
    title: (count, hasUrgent) =>
      hasUrgent
        ? `${count}件の食材が期限間近です`
        : `${count}件の食材の賞味期限（品質の目安）が近づいています`,
    itemLine: (name, expiryDate, expiryType) =>
      expiryType === "best_before"
        ? `${name} (${expiryDate}, 賞味期限)`
        : expiryType === "use_by"
          ? `${name} (${expiryDate}, 消費期限)`
          : `${name} (${expiryDate})`,
    emailIntro: "期限間近の食材:",
  },
  en: {
    title: (count, hasUrgent) =>
      hasUrgent
        ? `${count} item(s) are expiring soon`
        : `${count} item(s) are approaching their best-before (quality) date`,
    itemLine: (name, expiryDate, expiryType) =>
      expiryType === "best_before"
        ? `${name} (${expiryDate}, best-before)`
        : expiryType === "use_by"
          ? `${name} (${expiryDate}, use-by)`
          : `${name} (${expiryDate})`,
    emailIntro: "Items expiring soon:",
  },
};

const isSupportedLanguage = (value: unknown): value is "ja" | "en" =>
  value === "ja" || value === "en";

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

  // #834: lazy dynamic import (not a static top-level import) so importing
  // this module in tests doesn't require network access to esm.sh just to
  // resolve a handler that never reaches this line (e.g. preflight/cron-auth
  // tests) — matches the pattern already used by subscribe-push/image-proxy.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // pg_cron からの定期実行（?scheduled=true）では、ユーザーごとの notify_at を
  // そのユーザーの timezone（#660、未設定時は Asia/Tokyo）で解釈した時刻に
  // 一致する場合のみ送信し、notification_logs で 1 日 1 通に制限する。
  // 手動呼び出し（クエリなし）では従来どおり全有効ユーザーへ即時送信する。
  const scheduled = new URL(req.url).searchParams.get("scheduled") === "true";

  // Fetch all users with notifications enabled.
  // #787: mirrors the #669/#695 fix — a single unbounded select silently
  // truncates once the number of opted-in users exceeds PostgREST's row cap
  // (default 1000, see supabase/config.toml's `api.max_rows`), so page
  // through with fetchAllPages instead.
  let prefs: NotificationPreference[];
  try {
    prefs = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select(
          "user_id, push_enabled, email_enabled, email_address, threshold_days, notify_at, timezone",
        )
        .or("push_enabled.eq.true,email_enabled.eq.true")
        .order("user_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as NotificationPreference[];
    });
  } catch (error) {
    console.error("Failed to fetch preferences:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = await Promise.allSettled(
    prefs.map(async (pref) => {
      const timezone = pref.timezone ?? "Asia/Tokyo";
      const zoned = zonedNow(timezone);

      // 定期実行時は、ユーザーが設定した通知時刻(そのユーザーのtimezone基準)の
      // 「時」に一致する場合のみ送信する
      if (scheduled) {
        const notifyHour = pref.notify_at ? parseInt(pref.notify_at.split(":")[0], 10) : 8;
        if (notifyHour !== zoned.hour) return;
      }

      // Calculate the threshold date (ユーザーのtimezone基準)
      const thresholdStr = zonedDateString(timezone, pref.threshold_days);

      // Fetch expiring/expired items for this user.
      // 下限(gte today)は設けない — 既に期限切れの item も対象に含める（#445）。
      // opened_remaining = 0（開封済み・空）の item は対象外とする（#445）。
      // #787: mirrors the #669/#695 fix — page through with fetchAllPages so
      // a user with more than PostgREST's row cap (default 1000) worth of
      // expiring items isn't silently truncated.
      let items: ExpiringItem[];
      try {
        items = await fetchAllPages(async (from, to) => {
          const { data, error } = await supabase
            .from("items")
            .select("id, name, expiry_date, expiry_type, item_type, categories(kind)")
            .eq("user_id", pref.user_id)
            .not("expiry_date", "is", null)
            .lte("expiry_date", thresholdStr)
            .gt("units", 0)
            .or("opened_remaining.is.null,opened_remaining.neq.0")
            .order("id", { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as ExpiringItem[];
        });
      } catch (error) {
        console.error("Failed to fetch items for user", pref.user_id, error);
        return;
      }

      // #937: 日用品に切り替え済みのアイテムは対象外にする。
      items = items.filter(
        (item) => resolveItemType(item.item_type, item.categories?.kind) !== "daily_goods",
      );

      if (items.length === 0) return;

      const count = items.length;

      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("language")
        .eq("user_id", pref.user_id)
        .maybeSingle();
      const language = isSupportedLanguage(userSettings?.language) ? userSettings.language : "ja";
      const text = EXPIRY_NOTIFICATION_TEXT[language];

      // 定期実行時は notification_logs を見て、当日分が既に確定済み（＝実送信に
      // 成功済み）ならスキップする（重複送信防止）。
      // #827: 送信枠のクレームは実送信の成否が判明した後（このブロックの末尾）に
      // 行う。ここで先にクレームを確定してしまうと、VAPID環境変数未設定や
      // Resend API障害等で実送信自体が失敗した場合でもクレームだけが消費され、
      // その日は二度とリトライされなくなる。
      if (scheduled) {
        const { data: existingLog } = await supabase
          .from("notification_logs")
          .select("user_id")
          .eq("user_id", pref.user_id)
          .eq("sent_on", zoned.date)
          .maybeSingle();
        if (existingLog) return;
      }

      // #714: 消費期限（use_by）または区別未設定（null, 既存アイテム互換）の item が
      // 1件でもあれば、通知全体を従来通りの「緊急」文言・優先度にする。賞味期限
      // （best_before）のみで構成される場合だけ穏やかな文言にする。
      const hasUrgentItem = items.some((i) => i.expiry_type !== "best_before");
      const title = text.title(count, hasUrgentItem);
      const body = items
        .slice(0, 3)
        .map((i) => text.itemLine(i.name, i.expiry_date, i.expiry_type))
        .join(", ");
      const notificationUrl = buildNotificationTargetUrl(items);

      // Send push notifications
      let pushDelivered = false;
      if (pref.push_enabled) {
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
        const vapidSubject = Deno.env.get("VAPID_SUBJECT");

        if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
          // #834: lazy dynamic import — this package (via http_ece) reads
          // process.env.ECE_KEYLOG at module top level, which would require
          // --allow-env just to import this module in tests (e.g.
          // preflight/cron-auth tests that never reach this line). A static
          // top-level import would fail in real CI too, since `deno test`
          // there runs without --allow-env.
          const { default: webpush } = await import("npm:web-push@3");
          webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

          const { data: subs, error: subsError } = await supabase
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("user_id", pref.user_id);

          if (subsError) {
            // #760: don't let a transient push_subscriptions read failure
            // throw here — an uncaught error would skip the email fallback
            // below and leave the user with zero notifications for the day.
            console.error("Failed to fetch push_subscriptions:", subsError);
          } else {
            const outcomes = await Promise.all(
              (subs as PushSubscription[]).map(async (sub) => {
                try {
                  await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    JSON.stringify({ title, body, data: { url: notificationUrl } }),
                  );
                  return true;
                } catch (err: unknown) {
                  const status = (err as { statusCode?: number }).statusCode;
                  if (status === 410 || status === 404) {
                    // Subscription expired — remove it
                    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                  }
                  console.error("Push failed:", err);
                  return false;
                }
              }),
            );
            pushDelivered = wasAnyPushDelivered(outcomes);
          }
        } else {
          console.warn("VAPID secrets not configured, skipping push for user", pref.user_id);
        }
      }

      // Send email notifications via Resend
      let emailDelivered = false;
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
            text: `${text.emailIntro}\n${items.map((i) => `- ${text.itemLine(i.name, i.expiry_date, i.expiry_type)}`).join("\n")}`,
          }),
        });
        if (res.ok) {
          emailDelivered = true;
        } else {
          console.error("Email send failed:", await res.text());
        }
      }

      // #827: 実送信の成否が判明した後、少なくとも1チャネルが実際に配信できた
      // 場合のみ当日分の送信枠を確定する。どのチャネルも配信できなかった場合は
      // 確定せず、次回実行時にリトライできるようにする。
      if (
        scheduled &&
        shouldClaimNotificationSlot({
          pushEnabled: pref.push_enabled,
          pushDelivered,
          emailEnabled: pref.email_enabled,
          emailDelivered,
        })
      ) {
        await supabase
          .from("notification_logs")
          .upsert(
            { user_id: pref.user_id, sent_on: zoned.date, item_count: count },
            { onConflict: "user_id,sent_on", ignoreDuplicates: true },
          );
      }
    }),
  );

  const errors = results.filter((r) => r.status === "rejected");
  if (errors.length > 0) {
    console.error("Some notifications failed:", errors);
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
