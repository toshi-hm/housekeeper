import { createClient } from "jsr:@supabase/supabase-js@2";
import type { InventoryItem } from "./types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const userId = Deno.env.get("USER_ID")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const fetchAllItems = async (): Promise<InventoryItem[]> => {
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, name, category_id, storage_location_id, units, content_amount, content_unit, opened_remaining, expiry_date, deleted_at, categories(name), storage_locations(name)",
    )
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error("[inventory] fetchAllItems error:", error);
    return [];
  }

  return (data ?? []) as InventoryItem[];
};

export const formatTotalRemaining = (item: InventoryItem): string => {
  const { units, content_amount, content_unit, opened_remaining } = item;
  if (units === 0 && opened_remaining === null) return `0${content_unit}`;

  const closedUnits = opened_remaining !== null ? units - 1 : units;
  const closedAmount = closedUnits * content_amount;
  const total = closedAmount + (opened_remaining ?? 0);

  if (Number.isInteger(total)) return `${total}${content_unit}`;
  return `${Math.round(total * 100) / 100}${content_unit}`;
};

export const formatExpiryDate = (expiryDate: string | null): string => {
  if (!expiryDate) return "未設定";
  const d = new Date(expiryDate);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
