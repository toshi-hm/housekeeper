import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { IconPicker } from "./IconPicker";

const meta = {
  component: IconPicker,
  tags: ["autodocs"],
} satisfies Meta<typeof IconPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "Refrigerator",
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
  const [icon, setIcon] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <IconPicker value={icon} onChange={setIcon} />
      <p className="text-sm text-muted-foreground">選択中: {icon ?? "なし"}</p>
    </div>
  );
};

export const Interactive: Story = {
  args: { value: null, onChange: () => {} },
  render: () => <InteractiveDemo />,
};
