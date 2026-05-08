import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { ColorPicker } from "./ColorPicker";

const meta = {
  component: ColorPicker,
  tags: ["autodocs"],
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "#3b82f6",
    onChange: () => {},
  },
};

export const NoneSelected: Story = {
  args: {
    value: null,
    onChange: () => {},
  },
};

const InteractiveDemo = () => {
  const [color, setColor] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <ColorPicker value={color} onChange={setColor} />
      <p className="text-sm text-muted-foreground">選択中: {color ?? "なし"}</p>
    </div>
  );
};

export const Interactive: Story = {
  args: { value: null, onChange: () => {} },
  render: () => <InteractiveDemo />,
};
