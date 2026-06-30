import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { InventoryItem, RecentlyConsumedItem } from "./types.ts";

const ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, categories(name), storage_locations(name)";

// Build a Supabase client scoped to the requesting user's JWT.
// RLS then restricts every query to that user's rows — no service-role key,
// no hardcoded USER_ID. Returns null when env or the auth header is missing.
export const getUserScopedClient = (authHeader: string | null): SupabaseClient | null => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey || !authHeader) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
};

export const fetchAllItems = async (supabase: SupabaseClient): Promise<InventoryItem[] | null> => {
  const { data, error } = await supabase.from("items").select(ITEM_SELECT).is("deleted_at", null);

  if (error) {
    console.error("[inventory-chat] fetchAllItems error:", error);
    return null;
  }
  return (data ?? []) as InventoryItem[];
};

export const fetchRecentlyConsumedItems = async (
  supabase: SupabaseClient,
): Promise<RecentlyConsumedItem[]> => {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const { data, error } = await supabase
    .from("consumption_logs")
    .select("item_id, occurred_at, items(name, units, deleted_at)")
    .gte("occurred_at", twoMonthsAgo.toISOString())
    .order("occurred_at", { ascending: false });

  if (error) {
    console.error("[inventory-chat] fetchRecentlyConsumedItems error:", error);
    return [];
  }

  // Keep only items currently empty (deleted or units=0); dedupe to most recent.
  const seen = new Set<string>();
  const result: RecentlyConsumedItem[] = [];
  for (const row of data ?? []) {
    const item = row.items as { name: string; units: number; deleted_at: string | null } | null;
    if (!item || seen.has(row.item_id)) continue;
    if (item.deleted_at !== null || item.units === 0) {
      seen.add(row.item_id);
      result.push({
        item_id: row.item_id,
        item_name: item.name,
        last_consumed_at: row.occurred_at,
      });
    }
  }
  return result;
};
