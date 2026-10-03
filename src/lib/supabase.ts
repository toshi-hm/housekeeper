import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export type { Database } from "@/types/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
