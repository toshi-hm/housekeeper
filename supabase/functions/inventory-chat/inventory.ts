import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { fetchAllPages } from "../_shared/pagination.ts";
import { dropExpiryForDailyGoods } from "../_shared/itemType.ts";
import type { InventoryItem, RecentlyConsumedItem } from "./types.ts";

const ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, item_type, categories(name, kind), storage_locations(name)";

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
  try {
    // #669: a single unbounded select silently truncates once a user's items
    // exceed PostgREST's row cap (default 1000). Page through with a stable
    // order (id) instead, mirroring src/lib/supabasePagination.ts's usage.
    const items = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("items")
        .select(ITEM_SELECT)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    });
    // #966: a category (or item) switched to daily_goods after the fact can
    // still have a stale expiry_date left over from when it was food.
    return dropExpiryForDailyGoods(items);
  } catch (error) {
    console.error("[inventory-chat] fetchAllItems error:", error);
    return null;
  }
};

export const fetchRecentlyConsumedItems = async (
  supabase: SupabaseClient,
): Promise<RecentlyConsumedItem[]> => {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  let data: Array<{
    item_id: string;
    occurred_at: string;
    items: {
      name: string;
      units: number;
      opened_remaining: number | null;
      deleted_at: string | null;
    } | null;
  }>;
  try {
    // #669: a single unbounded select silently truncates once a user's
    // consumption_logs exceed PostgREST's row cap (default 1000). Page
    // through with a stable order (occurred_at desc, id as tiebreaker).
    data = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("consumption_logs")
        .select("item_id, occurred_at, items(name, units, opened_remaining, deleted_at)")
        .gte("occurred_at", twoMonthsAgo.toISOString())
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    });
  } catch (error) {
    console.error("[inventory-chat] fetchRecentlyConsumedItems error:", error);
    return [];
  }

  // Keep only items currently empty (deleted, or units=0 with no opened
  // remainder — mirrors src/types/item.ts's isAlreadyInStock so an item
  // that's units=0 but still has an opened lot in progress isn't reported
  // as both "in stock" and "recently consumed" at once); dedupe to most recent.
  const seen = new Set<string>();
  const result: RecentlyConsumedItem[] = [];
  for (const row of data) {
    const item = row.items;
    if (!item || seen.has(row.item_id)) continue;
    const isInStock = item.units > 0 || (item.opened_remaining ?? 0) > 0;
    if (item.deleted_at !== null || !isInStock) {
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
