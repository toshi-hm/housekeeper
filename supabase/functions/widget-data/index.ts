import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jstTodayString } from "./date.ts";
import { buildWidgetSummary, type WidgetItemInput } from "./summary.ts";

/**
 * PWA Web App Widgets（実験的機能, #367）向けのデータエンドポイント。
 *
 * Web App Widgets は 2026-07 時点で Chrome/Edge の Origin Trial 段階の仕様であり、
 * ほとんどのブラウザ・OS はまだホーム画面ウィジェットのレンダリングに対応していない。
 * 対応が進んだ際にすぐ使えるよう、先行してデータ API のみ用意する
 * （詳細は docs/specs/features/pwa.md を参照）。
 *
 * 認証は subscribe-push と同じ Bearer JWT パターンを踏襲しているが、
 * 現行の Widget ホスト実装はページ外から独自の Authorization ヘッダーを
 * 付与する手段を標準化していないため、実機のウィジェットから認証付きで
 * 取得できることは現時点では保証されない（手動検証・将来対応のための実装）。
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

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
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("expiry_warning_days")
    .eq("user_id", user.id)
    .maybeSingle();
  const warningDays =
    (settings as { expiry_warning_days: number } | null)?.expiry_warning_days ?? 3;

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("name, units, expiry_date, opened_remaining, minimum_stock")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (itemsError) {
    console.error("Failed to fetch items for widget-data:", itemsError);
    return jsonResponse({ error: itemsError.message }, 500);
  }

  const summary = buildWidgetSummary(
    (items ?? []) as WidgetItemInput[],
    jstTodayString(),
    warningDays,
    new Date().toISOString(),
  );

  return jsonResponse(summary);
});
