import { fetchAllPages } from "../_shared/pagination.ts";
import { dropExpiryForDailyGoods } from "../_shared/itemType.ts";
import { z } from "zod";
import type { InventoryItem, RecentlyConsumedItem } from "./types.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
export type { RemainingFields } from "./inventory-formatters.ts";
export { formatExpiryDate, formatTotalRemaining } from "./inventory-formatters.ts";

const ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, item_type, categories(name, kind), storage_locations(name)";

// !inner forces an INNER JOIN so only items with a matching storage_location row are returned.
const LOCATION_ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, item_type, categories(name, kind), storage_locations!inner(name)";

const itemTypeSchema = z.enum(["food", "daily_goods"]).nullable();
const categorySchema = z.object({ name: z.string(), kind: itemTypeSchema });
const storageLocationSchema = z.object({ name: z.string() });

const inventoryItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category_id: z.string().nullable(),
    storage_location_id: z.string().nullable(),
    units: z.number(),
    content_amount: z.number(),
    content_unit: z.string(),
    opened_remaining: z.number().nullable(),
    expiry_date: z.string().nullable(),
    deleted_at: z.string().nullable(),
    item_type: itemTypeSchema,
    categories: z.union([categorySchema, z.array(categorySchema)]).nullable(),
    storage_locations: z.union([storageLocationSchema, z.array(storageLocationSchema)]).nullable(),
  })
  .transform((item): InventoryItem => ({
    ...item,
    categories: Array.isArray(item.categories) ? (item.categories[0] ?? null) : item.categories,
    storage_locations: Array.isArray(item.storage_locations)
      ? (item.storage_locations[0] ?? null)
      : item.storage_locations,
  }));

const recentItemSchema = z.object({
  name: z.string(),
  units: z.number(),
  deleted_at: z.string().nullable(),
});
const recentlyConsumedRowSchema = z
  .object({
    item_id: z.string(),
    occurred_at: z.string(),
    items: z.union([recentItemSchema, z.array(recentItemSchema)]).nullable(),
  })
  .transform((row) => ({
    ...row,
    items: Array.isArray(row.items) ? (row.items[0] ?? null) : row.items,
  }));

export const fetchAllItems = async (supabase: SupabaseClient): Promise<InventoryItem[] | null> => {
  try {
    // #695: mirrors the #669 fix — a single unbounded select silently
    // truncates once a user's items exceed PostgREST's row cap (default
    // 1000). Page through with a stable order instead.
    const items = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("items")
        .select(ITEM_SELECT)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return z.array(inventoryItemSchema).parse(data ?? []);
    });
    // #966: a category (or item) switched to daily_goods after the fact can
    // still have a stale expiry_date left over from when it was food.
    return dropExpiryForDailyGoods(items);
  } catch (error) {
    console.error("[inventory] fetchAllItems error:", error);
    return null;
  }
};

export const fetchRecentlyConsumedItems = async (
  supabase: SupabaseClient,
): Promise<RecentlyConsumedItem[] | null> => {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  // Fetch recent consumption logs joined with item state.
  // units_after in consumption_logs reflects lot-level units, not the whole item,
  // so we include the item's current units and deleted_at to determine if it's fully gone.
  let data: Array<{
    item_id: string;
    occurred_at: string;
    items: { name: string; units: number; deleted_at: string | null } | null;
  }>;
  try {
    // #695: mirrors the #669 fix — page through with a stable order
    // (occurred_at desc, id as tiebreaker) instead of a single unbounded
    // select, which silently truncates past PostgREST's row cap.
    data = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("consumption_logs")
        .select("item_id, occurred_at, items(name, units, deleted_at)")
        .gte("occurred_at", twoMonthsAgo.toISOString())
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return z.array(recentlyConsumedRowSchema).parse(data ?? []);
    });
  } catch (error) {
    console.error("[inventory] fetchRecentlyConsumedItems error:", error);
    return null;
  }

  // Keep only items that are currently empty: deleted or units=0.
  // Items still in inventory with units>0 are already in the inventory context.
  // Deduplicate: keep the most recent consumption event per item.
  const seen = new Set<string>();
  const result: RecentlyConsumedItem[] = [];
  for (const row of data) {
    const item = row.items;
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
  supabase: SupabaseClient,
  locationName: string,
): Promise<InventoryItem[] | null> => {
  try {
    // #695: mirrors the #669 fix — page through instead of a single
    // unbounded select.
    const items = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("items")
        .select(LOCATION_ITEM_SELECT)
        .is("deleted_at", null)
        .eq("storage_locations.name", locationName)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return z.array(inventoryItemSchema).parse(data ?? []);
    });
    // #966: mirrors fetchAllItems's daily_goods expiry_date scrub.
    return dropExpiryForDailyGoods(items);
  } catch (error) {
    console.error("[inventory] fetchItemsByLocation error:", error);
    return null;
  }
};
