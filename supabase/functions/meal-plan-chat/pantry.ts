import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { fetchAllPages } from "../_shared/pagination.ts";
import { resolveItemType } from "../_shared/itemType.ts";
import type { PantryItem } from "./types.ts";

const ITEM_SELECT =
  "id, name, units, content_amount, content_unit, opened_remaining, expiry_date, item_type, categories(name, kind), storage_locations(name)";

// Build a Supabase client scoped to the requesting user's JWT so RLS restricts
// every query to that user's household — no service-role key. Returns null when
// env or the auth header is missing.
export const getUserScopedClient = (authHeader: string | null): SupabaseClient | null => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey || !authHeader) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
};

// Food items that are actually in stock — the only things a menu can use.
// Daily goods and fully used-up items are dropped here so the model never
// proposes toilet paper or an empty milk carton as an ingredient.
export const selectCookableItems = (items: PantryItem[]): PantryItem[] =>
  items.filter(
    (item) =>
      resolveItemType(item.item_type, item.categories?.kind) === "food" &&
      (item.units > 0 || (item.opened_remaining ?? 0) > 0),
  );

export const fetchPantryItems = async (supabase: SupabaseClient): Promise<PantryItem[] | null> => {
  try {
    const items = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("items")
        .select(ITEM_SELECT)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as PantryItem[];
    });
    return selectCookableItems(items);
  } catch (error) {
    console.error("[meal-plan-chat] fetchPantryItems error:", error);
    return null;
  }
};
