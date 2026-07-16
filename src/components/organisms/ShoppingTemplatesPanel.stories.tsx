import type { Meta, StoryObj } from "@storybook/react";

import type { ShoppingTemplateWithItems } from "@/types/shopping";

import { ShoppingTemplatesPanel } from "./ShoppingTemplatesPanel";

const templates: ShoppingTemplateWithItems[] = [
  {
    id: "tpl-1",
    user_id: "u-1",
    name: "毎週の買い物",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    items: [
      {
        id: "i-1",
        template_id: "tpl-1",
        user_id: "u-1",
        name: "牛乳",
        desired_units: 2,
        created_at: "2026-06-01T00:00:00Z",
      },
      {
        id: "i-2",
        template_id: "tpl-1",
        user_id: "u-1",
        name: "卵",
        desired_units: 1,
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
  },
];

const meta = {
  component: ShoppingTemplatesPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onApply: () => {},
    onSave: () => Promise.resolve(),
    onDelete: () => {},
  },
} satisfies Meta<typeof ShoppingTemplatesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTemplates: Story = {
  args: { templates },
};

export const Empty: Story = {
  args: { templates: [] },
};
