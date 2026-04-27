import { z } from "zod";

export const itemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  barcode: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  quantity: z.number().int().min(0).default(1),
  storage_location: z.string().nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export const itemFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  barcode: z.string().optional(),
  category: z.string().optional(),
  quantity: z.coerce.number().int().min(0).default(1),
  storage_location: z.string().optional(),
  purchase_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
  image_url: z.string().optional(),
});

export type Item = z.infer<typeof itemSchema>;
export type ItemFormValues = z.infer<typeof itemFormSchema>;

export type ExpiryStatus = "expired" | "expiring-soon" | "ok" | "unknown";
export const EXPIRY_WARNING_DAYS = 3;

export function getExpiryStatus(expiryDate: string | null | undefined): ExpiryStatus {
  if (!expiryDate) return "unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= EXPIRY_WARNING_DAYS) return "expiring-soon";
  return "ok";
}
