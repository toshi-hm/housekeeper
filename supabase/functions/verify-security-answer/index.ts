import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sha256hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, answer, new_password } = (await req.json()) as {
      email?: string;
      answer?: string;
      new_password?: string;
    };

    if (!email || !answer || !new_password) {
      return json({ error: "email, answer, new_password are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error: fetchError } = await supabase
      .from("user_security_questions")
      .select("user_id, answer_hash")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (fetchError || !row) {
      return json({ error: "登録情報が見つかりません" }, 404);
    }

    const hash = await sha256hex(answer.toLowerCase().trim());
    if (hash !== row.answer_hash) {
      return json({ error: "秘密の質問の答えが正しくありません" }, 401);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      row.user_id,
      { password: new_password },
    );

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
