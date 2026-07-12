import { z } from "zod";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorageLocation {
  id: string;
  user_id: string;
  name: string;
  icon?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  barcode?: string | null;
  category_id?: string | null;
  storage_location_id?: string | null;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining?: number | null;
  purchase_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  image_path?: string | null;
  minimum_stock?: number | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const itemFormSchema = z.object({
  name: z.string().min(1),
  barcode: z.string().optional(),
  category_id: z.string().uuid().nullable().optional(),
  storage_location_id: z.string().uuid().nullable().optional(),
  units: z.coerce.number().int().min(1).default(1),
  content_amount: z.coerce.number().positive().default(1),
  content_unit: z.string().default("個"),
  opened_remaining: z.coerce.number().min(0).nullable().optional(),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
  image_path: z.string().optional(),
  minimum_stock: z.coerce.number().int().min(0).nullable().optional(),
});

export const itemLotSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  item_id: z.string().uuid(),
  units: z.number().int().min(0).default(1),
  opened_remaining: z.number().min(0).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export interface UserSettings {
  user_id: string;
  language: "ja" | "en";
  expiry_warning_days: number;
  default_unit: string;
  notify_at: string;
  created_at: string;
  updated_at: string;
}

export type ItemLot = z.infer<typeof itemLotSchema>;
export type ItemFormValues = z.infer<typeof itemFormSchema>;

export type ExpiryStatus = "expired" | "expiring-soon" | "ok" | "unknown";

/** Error codes returned by computeConsumption. Each value is also an i18n key
 *  in the `items` namespace. */
export type ConsumptionError = "insufficientStock";

/** Filters applied server-side (Supabase query). Client-only filters such as
 *  expiryStatus and hideEmpty are handled by the caller after fetching. */
export interface ItemFilters {
  search?: string;
  categoryId?: string;
  storageLocationId?: string;
}

export type ItemSortKey = "expiry_date" | "purchase_date" | "created_at";

export interface ConsumeParams {
  item: Item;
  deltaAmount: number;
}

export interface ConsumeLotParams {
  lot: ItemLot;
  item: Pick<Item, "content_amount" | "content_unit">;
  deltaAmount: number;
}

export const DEFAULT_EXPIRY_WARNING_DAYS = 3;

export const CONTENT_UNITS = ["個", "枚", "本", "袋", "mL", "L", "g", "kg"] as const;

export const getExpiryStatus = (
  expiryDate: string | null | undefined,
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
): ExpiryStatus => {
  if (!expiryDate) return "unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = expiryDate.split("-").map(Number) as [number, number, number];
  const expiry = new Date(year, month - 1, day);
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= warningDays) return "expiring-soon";
  return "ok";
};

/** ロット（またはアイテム）1件の実残量を計算する。opened_remaining がある場合は
 *  開封中の1個を除いた残りの未開封数量にopened_remainingを加算する。 */
export const getLotRemainingAmount = (
  units: number,
  contentAmount: number,
  openedRemaining: number | null,
): number =>
  openedRemaining !== null
    ? Math.max(0, units - 1) * contentAmount + openedRemaining
    : units * contentAmount;

/** カードや一覧で使う「残量」の合計値を文字列として返す。 */
export const formatRemaining = (
  units: number,
  contentAmount: number,
  openedRemaining: number | null,
): string => {
  const total = getLotRemainingAmount(units, contentAmount, openedRemaining);
  return total % 1 === 0 ? String(total) : total.toFixed(2).replace(/\.?0+$/, "");
};

export const computeConsumption = (
  item: Pick<Item, "units" | "content_amount" | "content_unit" | "opened_remaining">,
  delta: number,
): {
  units_after: number;
  opened_remaining_after: number | null;
  error?: ConsumptionError;
} => {
  const { content_amount: contentAmount, units } = item;
  const openedRemaining = item.opened_remaining ?? null;

  // Compute total available stock to detect over-consumption before mutating state.
  // When opened_remaining is set, the open unit is already counted in `units`,
  // so sealed units = units - 1.
  const totalBefore =
    units === 0
      ? 0
      : openedRemaining !== null
        ? (units - 1) * contentAmount + openedRemaining
        : units * contentAmount;

  if (delta > totalBefore) {
    return { units_after: 0, opened_remaining_after: null, error: "insufficientStock" };
  }

  // Round to avoid floating-point noise (DB stores numeric(12,2))
  const round = (n: number) => Math.round(n * 1e10) / 1e10;
  const totalAfter = round(totalBefore - delta);

  if (totalAfter === 0) {
    return { units_after: 0, opened_remaining_after: null };
  }

  const sealedUnits = Math.floor(round(totalAfter / contentAmount));
  const openedAfter = round(totalAfter - sealedUnits * contentAmount);

  if (openedAfter === 0) {
    return { units_after: sealedUnits, opened_remaining_after: null };
  }
  return { units_after: sealedUnits + 1, opened_remaining_after: openedAfter };
};
