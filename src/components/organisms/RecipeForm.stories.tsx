import type { Meta, StoryObj } from "@storybook/react";

import type { Item } from "@/types/item";

import { RecipeForm } from "./RecipeForm";

const availableItems: Pick<Item, "id" | "name" | "content_unit">[] = [
  { id: "item-1", name: "コーヒー豆", content_unit: "g" },
  { id: "item-2", name: "フィルター", content_unit: "個" },
  { id: "item-3", name: "牛乳", content_unit: "mL" },
];

const meta = {
  component: RecipeForm,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    availableItems,
    onSubmit: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof RecipeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const Editing: Story = {
  args: {
    defaultValues: {
      name: "朝のコーヒー",
      items: [
        { item_id: "item-1", amount: 15 },
        { item_id: "item-2", amount: 1 },
      ],
    },
    submitLabel: "更新",
  },
};

export const NoAvailableItems: Story = {
  args: { availableItems: [] },
};
