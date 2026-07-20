import { createClient } from "jsr:@supabase/supabase-js@2";

import { checkRateLimit, timingSafeEqual } from "../_shared/rate-limit.ts";
import {
  isValidAnswerInput,
  isValidEmailInput,
  isValidNewPasswordInput,
  normalizeEmail,
  sha256hex,
} from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT_SCOPE = "verify-security-answer";

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, answer, new_password } = (await req.json()) as {
      email?: unknown;
      answer?: unknown;
      new_password?: unknown;
    };

    if (!isValidEmailInput(email)) {
      return json({ error: "email is required" }, 400);
    }
    if (!isValidAnswerInput(answer)) {
      return json({ error: "answer is required" }, 400);
    }
    if (!isValidNewPasswordInput(new_password)) {
      return json({ error: "new_password is required" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // #433: throttle repeated answer guesses against the same email to
    // prevent brute-forcing the (low-entropy) secret question answer.
    const rateLimit = await checkRateLimit(supabase, RATE_LIMIT_SCOPE, normalizedEmail);
    if (!rateLimit.allowed) {
      return json({ error: "しばらく時間をおいて再度お試しください" }, 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const { data: row, error: fetchError } = await supabase
      .from("user_security_questions")
      .select("user_id, answer_hash")
      .eq("email", normalizedEmail)
      .single();

    if (fetchError || !row) {
      // Return 401 (same as wrong answer) to avoid email enumeration
      return json({ error: "秘密の質問の答えが正しくありません" }, 401);
    }

    const hash = await sha256hex(row.user_id + ":" + answer.toLowerCase().trim());
    // Constant-time comparison to avoid leaking hash-match info via timing.
    if (!(await timingSafeEqual(hash, row.answer_hash))) {
      return json({ error: "秘密の質問の答えが正しくありません" }, 401);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(row.user_id, {
      password: new_password,
    });

    if (updateError) {
      console.error(updateError);
      return json({ error: "パスワードの更新に失敗しました" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});
