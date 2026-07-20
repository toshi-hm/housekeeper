import type { Meta, StoryObj } from "@storybook/react";

import { MasterDataIcon } from "./MasterDataIcon";

const meta = {
  component: MasterDataIcon,
  tags: ["autodocs"],
} satisfies Meta<typeof MasterDataIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { icon: "Refrigerator" },
};

export const NoIcon: Story = {
  args: { icon: null },
};

export const UnknownIcon: Story = {
  args: { icon: "SomeRemovedIconName" },
};

export const CustomSize: Story = {
  args: { icon: "Snowflake", className: "h-5 w-5" },
};
