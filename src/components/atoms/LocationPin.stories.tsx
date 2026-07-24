import type { Meta, StoryObj } from "@storybook/react";

import { LocationPin } from "./LocationPin";

const meta = {
  component: LocationPin,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="relative h-40 w-full rounded-lg bg-muted">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocationPin>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { x: 0.5, y: 0.5, label: "牛乳" },
};

export const Selected: Story = {
  args: { x: 0.3, y: 0.4, label: "選択中のピン", variant: "selected" },
};

export const NearEdge: Story = {
  args: { x: 0.05, y: 0.1, label: "端に配置したピン" },
};
