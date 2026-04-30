import { z } from "zod";

export const categorySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const storageLocationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  icon: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  barcode: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  storage_location_id: z.string().uuid().nullable().optional(),
  units: z.number().int().min(0).default(1),
  content_amount: z.number().positive().default(1),
  content_unit: z.string().default("個"),
  opened_remaining: z.number().min(0).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  image_path: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const itemFormSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  barcode: z.string().optional(),
  category_id: z.string().uuid().nullable().optional(),
  storage_location_id: z.string().uuid().nullable().optional(),
  units: z.coerce.number().int().min(0).default(1),
  content_amount: z.coerce.number().positive().default(1),
  content_unit: z.string().default("個"),
  opened_remaining: z.coerce.number().min(0).nullable().optional(),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
  image_path: z.string().optional(),
});

export const consumeFormSchema = z.object({
  delta_amount: z.coerce.number().positive("消費量は0より大きい値を入力してください"),
});

export const userSettingsSchema = z.object({
  user_id: z.string().uuid(),
  language: z.enum(["ja", "en"]).default("ja"),
  expiry_warning_days: z.number().int().min(0).default(3),
  default_unit: z.string().default("mL"),
  notify_at: z.string().default("08:00"),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Category = z.infer<typeof categorySchema>;
export type StorageLocation = z.infer<typeof storageLocationSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemFormValues = z.infer<typeof itemFormSchema>;
export type ConsumeFormValues = z.infer<typeof consumeFormSchema>;
export type UserSettings = z.infer<typeof userSettingsSchema>;

export type ExpiryStatus = "expired" | "expiring-soon" | "ok" | "unknown";

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

export const computeConsumption = (
  item: Pick<Item, "units" | "content_amount" | "content_unit" | "opened_remaining">,
  delta: number,
): {
  units_after: number;
  opened_remaining_after: number | null;
  error?: string;
} => {
  const contentAmount = item.content_amount;
  let remaining = item.opened_remaining ?? contentAmount;
  let units = item.units;

  remaining -= delta;

  while (remaining < 0 && units > 0) {
    units -= 1;
    remaining += contentAmount;
  }

  if (remaining < 0) {
    return { units_after: 0, opened_remaining_after: 0, error: "在庫が不足しています" };
  }

  // opened unit fully consumed → decrement units
  if (remaining === 0) {
    units -= 1;
    if (units < 0) {
      return { units_after: 0, opened_remaining_after: 0, error: "在庫が不足しています" };
    }
    return { units_after: units, opened_remaining_after: null };
  }

  return {
    units_after: units,
    opened_remaining_after: remaining,
  };
};
