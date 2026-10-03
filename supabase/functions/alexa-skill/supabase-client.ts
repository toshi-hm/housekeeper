import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AlexaSupabaseContext {
  supabase: SupabaseClient;
  userId: string;
}

/** Validate an Alexa-linked Supabase access token and create a request-scoped RLS client. */
export const getSupabaseClient = async (
  accessToken: string,
): Promise<AlexaSupabaseContext | null> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase client is not configured");
  return getUserScopedSupabaseClient(supabaseUrl, supabaseAnonKey, accessToken);
};

export const getUserScopedSupabaseClient = async (
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<AlexaSupabaseContext | null> => {
  if (!accessToken) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: fetcher,
    },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    console.warn("[alexa-skill] Supabase access token validation failed");
    return null;
  }

  return { supabase, userId: data.user.id };
};
