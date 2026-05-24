import { createClient } from "jsr:@supabase/supabase-js@2";

export const getSupabaseClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userId = Deno.env.get("USER_ID");
  if (!supabaseUrl || !supabaseServiceKey || !userId) return null;
  return { supabase: createClient(supabaseUrl, supabaseServiceKey), userId };
};
