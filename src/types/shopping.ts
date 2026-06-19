import type { ItemFormValues } from "@/types/item";

export type ShoppingStatus = "planned" | "purchased";

export interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  desired_units: number;
  note: string | null;
  linked_item_id: string | null;
  status: ShoppingStatus;
  purchased_at: string | null;
  created_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertShoppingItemInput {
  id?: string;
  name: string;
  desired_units?: number;
  note?: string | null;
  linked_item_id?: string | null;
}

export interface PurchaseInput {
  shoppingItemId: string;
  itemValues: ItemFormValues;
}
