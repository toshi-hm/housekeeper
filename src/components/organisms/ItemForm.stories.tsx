import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { ItemForm } from "./ItemForm";

const meta = {
  component: ItemForm,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onSubmit: fn(),
    onBarcodeScanned: fn(),
    onPendingFileChange: fn(),
  },
} satisfies Meta<typeof ItemForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDefaultValues: Story = {
  args: {
    defaultValues: {
      name: "有機牛乳",
      barcode: "4901234567890",
      category_id: null,
      storage_location_id: null,
      units: 2,
      content_amount: 500,
      content_unit: "mL",
      purchase_date: "2024-01-01",
      expiry_date: "2099-12-31",
      notes: "地元農家から",
    },
  },
};

export const Submitting: Story = {
  args: {
    defaultValues: {
      name: "シャンプー",
      units: 1,
      content_amount: 400,
      content_unit: "mL",
    },
    isSubmitting: true,
  },
};

/** 追加購入として登録するモード（既存アイテムが検出された場合のラベル） */
export const StackMode: Story = {
  args: {
    defaultValues: {
      name: "有機牛乳",
      barcode: "4901234567890",
      units: 2,
      content_amount: 1000,
      content_unit: "mL",
      purchase_date: "2024-01-15",
      expiry_date: "2099-02-28",
    },
    submitLabel: "追加購入として登録",
  },
};
