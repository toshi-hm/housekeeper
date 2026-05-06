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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = (await req.json()) as { email?: string };

    if (!email) return json({ error: "email is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("user_security_questions")
      .select("question")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (error || !data) {
      // Intentionally vague to avoid email enumeration
      return json({ error: "登録情報が見つかりません" }, 404);
    }

    return json({ question: data.question });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});
