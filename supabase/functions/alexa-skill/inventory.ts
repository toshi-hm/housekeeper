import type { InventoryItem } from "./types.ts";
import { getSupabaseClient } from "./supabase-client.ts";

export interface RemainingFields {
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining: number | null;
}

const ITEM_SELECT =
  "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, categories(name), storage_locations(name)";

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
    .select(ITEM_SELECT)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("storage_locations.name", locationName);

  if (error) {
    console.error("[inventory] fetchItemsByLocation error:", error);
    return null;
  }
  return (data ?? []) as InventoryItem[];
};

export const formatTotalRemaining = (item: RemainingFields): string => {
  const { units, content_amount, content_unit, opened_remaining } = item;
  if (units === 0 && opened_remaining === null) return `0${content_unit}`;

  const closedUnits = opened_remaining !== null ? Math.max(units - 1, 0) : units;
  const closedAmount = closedUnits * content_amount;
  const total = closedAmount + (opened_remaining ?? 0);

  if (Number.isInteger(total)) return `${total}${content_unit}`;
  return `${Math.round(total * 100) / 100}${content_unit}`;
};

export const formatExpiryDate = (expiryDate: string | null): string => {
  if (!expiryDate) return "未設定";
  const parts = expiryDate.split("-");
  if (parts.length < 3) return expiryDate;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
};
