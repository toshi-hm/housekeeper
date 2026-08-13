import type { Meta, StoryObj } from "@storybook/react";

import { ReceiptLineItemRow } from "./ReceiptLineItemRow";

const categories = [
  { id: "c1", name: "飲料" },
  { id: "c2", name: "野菜" },
];
const locations = [
  { id: "l1", name: "冷蔵庫" },
  { id: "l2", name: "常温" },
];

const baseDraft = {
  id: "d1",
  name: "牛乳",
  quantity: 1,
  unitPrice: 248,
  confidence: "high" as const,
  categoryId: null,
  storageLocationId: null,
  expiryDate: null,
  included: true,
};

const meta = {
  component: ReceiptLineItemRow,
  tags: ["autodocs"],
  args: {
    categories,
    locations,
    onChange: () => {},
    onRemove: () => {},
  },
} satisfies Meta<typeof ReceiptLineItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighConfidence: Story = {
  args: { draft: baseDraft },
};

export const LowConfidence: Story = {
  args: { draft: { ...baseDraft, name: "にんじん?", unitPrice: null, confidence: "low" } },
};

export const Excluded: Story = {
  args: { draft: { ...baseDraft, included: false } },
};

export const Registering: Story = {
  args: { draft: baseDraft, status: "registering" },
};

export const Success: Story = {
  args: { draft: baseDraft, status: "success" },
};

export const Failed: Story = {
  args: { draft: baseDraft, status: "failed" },
};
