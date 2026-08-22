import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { PurchaseDialog } from "./PurchaseDialog";

const meta = {
  component: PurchaseDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onSubmit: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PurchaseDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: { open: true },
};

export const WithItemName: Story = {
  args: {
    open: true,
    itemName: "有機牛乳",
  },
};

export const Submitting: Story = {
  args: {
    open: true,
    itemName: "シャンプー",
    isSubmitting: true,
  },
};

export const Closed: Story = {
  args: { open: false },
};

// #830: linked_item_id で既存アイテムへ統合される場合、フォームに既存値が
// 初期表示され、統合先アイテム名のバナーが出ることを確認するストーリー。
export const MergingIntoExistingItem: Story = {
  args: {
    open: true,
    itemName: "有機牛乳",
    existingItem: {
      id: "item-1",
      user_id: "user-1",
      name: "有機牛乳",
      category_id: null,
      storage_location_id: null,
      units: 0,
      content_amount: 1000,
      content_unit: "mL",
      notes: "いつものスーパーで購入",
      minimum_stock: 1,
      auto_reorder: true,
      reorder_threshold: 1,
      expiry_type: "best_before",
      image_path: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  },
};
