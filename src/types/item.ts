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
  deleted_at: z.string().nullable().optional(),
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
export type ItemLot = z.infer<typeof itemLotSchema>;
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

/** カードや一覧で使う「残量」の合計値を文字列として返す。 */
export const formatRemaining = (
  units: number,
  contentAmount: number,
  openedRemaining: number | null,
): string => {
  const total =
    openedRemaining !== null
      ? (units - 1) * contentAmount + openedRemaining
      : units * contentAmount;
  return total % 1 === 0 ? String(total) : total.toFixed(2).replace(/\.?0+$/, "");
};

export const computeConsumption = (
  item: Pick<Item, "units" | "content_amount" | "content_unit" | "opened_remaining">,
  delta: number,
): {
  units_after: number;
  opened_remaining_after: number | null;
  error?: string;
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
    return { units_after: 0, opened_remaining_after: 0, error: "在庫が不足しています" };
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
