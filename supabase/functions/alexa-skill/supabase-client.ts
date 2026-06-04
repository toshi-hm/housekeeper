import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

let cachedCtx: { supabase: SupabaseClient; userId: string } | null = null;

export const getSupabaseClient = (): { supabase: SupabaseClient; userId: string } | null => {
  if (cachedCtx) return cachedCtx;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userId = Deno.env.get("USER_ID");
  if (!supabaseUrl || !supabaseServiceKey || !userId) return null;
  cachedCtx = { supabase: createClient(supabaseUrl, supabaseServiceKey), userId };
  return cachedCtx;
};
