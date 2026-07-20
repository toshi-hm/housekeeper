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

/** 「購入済みをクリア」時に shopping_list_archive へ保存される購入履歴行 (#365) */
export interface ArchivedShoppingItem {
  id: string;
  user_id: string;
  name: string;
  desired_units: number;
  note: string | null;
  archived_at: string;
}

interface ShoppingTemplate {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShoppingTemplateItem {
  id: string;
  template_id: string;
  user_id: string;
  name: string;
  desired_units: number;
  created_at: string;
}

export interface ShoppingTemplateWithItems extends ShoppingTemplate {
  items: ShoppingTemplateItem[];
}

/** テンプレート作成/編集時のアイテム入力（保存前の行） */
export interface TemplateItemInput {
  name: string;
  desired_units: number;
}

/**
 * テンプレートのアイテムのうち、既に買い物リスト（planned）に存在しない名前だけを返す。
 * 名前は前後空白を無視し、大文字小文字を区別せずに比較する。
 */
export const filterNewTemplateItems = (
  templateItems: readonly TemplateItemInput[],
  existingNames: readonly string[],
): TemplateItemInput[] => {
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const result: TemplateItemInput[] = [];
  for (const item of templateItems) {
    const key = item.name.trim().toLowerCase();
    if (!key || existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};
