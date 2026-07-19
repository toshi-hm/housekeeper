import type { Meta, StoryObj } from "@storybook/react";

import { DataExportPanel } from "./DataExportPanel";

const meta = {
  component: DataExportPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof DataExportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
