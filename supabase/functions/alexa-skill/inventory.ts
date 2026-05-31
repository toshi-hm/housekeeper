import type { InventoryItem, RecentlyConsumedItem } from "./types.ts";
import { getSupabaseClient } from "./supabase-client.ts";
export type { RemainingFields } from "./inventory-formatters.ts";
export { formatExpiryDate, formatTotalRemaining } from "./inventory-formatters.ts";

const ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, categories(name), storage_locations(name)";

// !inner forces an INNER JOIN so only items with a matching storage_location row are returned.
const LOCATION_ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, categories(name), storage_locations!inner(name)";

export const fetchAllItems = async (): Promise<InventoryItem[] | null> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[inventory] Missing required environment variables");
    return null;
  }
  const { supabase, userId } = ctx;
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_SELECT)
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error("[inventory] fetchAllItems error:", error);
    return null;
  }
  return (data ?? []) as InventoryItem[];
};

export const fetchRecentlyConsumedItems = async (): Promise<RecentlyConsumedItem[] | null> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[inventory] Missing required environment variables");
    return null;
  }
  const { supabase, userId } = ctx;
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const { data, error } = await supabase
    .from("consumption_logs")
    .select("item_id, occurred_at, items(name)")
    .eq("user_id", userId)
    .eq("units_after", 0)
    .gte("occurred_at", twoMonthsAgo.toISOString())
    .order("occurred_at", { ascending: false });

  if (error) {
    console.error("[inventory] fetchRecentlyConsumedItems error:", error);
    return null;
  }

  // Deduplicate: keep the most recent consumption event per item
  const seen = new Set<string>();
  const result: RecentlyConsumedItem[] = [];
  for (const row of data ?? []) {
    const itemName = (row.items as { name: string } | null)?.name;
    if (!itemName || seen.has(row.item_id)) continue;
    seen.add(row.item_id);
    result.push({
      item_id: row.item_id,
      item_name: itemName,
      last_consumed_at: row.occurred_at,
    });
  }
  return result;
};

export const fetchItemsByLocation = async (
  locationName: string,
): Promise<InventoryItem[] | null> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[inventory] Missing required environment variables");
    return null;
  }
  const { supabase, userId } = ctx;
  const { data, error } = await supabase
    .from("items")
    .select(LOCATION_ITEM_SELECT)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("storage_locations.name", locationName);

  if (error) {
    console.error("[inventory] fetchItemsByLocation error:", error);
    return null;
  }
  return (data ?? []) as InventoryItem[];
};
