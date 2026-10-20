import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";

import { InventoryChatPanel } from "./InventoryChatPanel";

const meta = {
  component: InventoryChatPanel,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: fn() },
} satisfies Meta<typeof InventoryChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};

// 献立エージェントのタブに切り替えた状態（専用の案内文・サジェストが表示される）
export const MealAgent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: /献立|Meal plan/ }));
    await expect(await canvas.findByRole("button", { pressed: true })).toBeVisible();
  },
};
