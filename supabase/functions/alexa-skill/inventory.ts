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

  // Fetch recent consumption logs joined with item state.
  // units_after in consumption_logs reflects lot-level units, not the whole item,
  // so we include the item's current units and deleted_at to determine if it's fully gone.
  const { data, error } = await supabase
    .from("consumption_logs")
    .select("item_id, occurred_at, items(name, units, deleted_at)")
    .eq("user_id", userId)
    .gte("occurred_at", twoMonthsAgo.toISOString())
    .order("occurred_at", { ascending: false });

  if (error) {
    console.error("[inventory] fetchRecentlyConsumedItems error:", error);
    return null;
  }

  // Keep only items that are currently empty: deleted or units=0.
  // Items still in inventory with units>0 are already in the inventory context.
  // Deduplicate: keep the most recent consumption event per item.
  const seen = new Set<string>();
  const result: RecentlyConsumedItem[] = [];
  for (const row of data ?? []) {
    const item = row.items as {
      name: string;
      units: number;
      deleted_at: string | null;
    } | null;
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
