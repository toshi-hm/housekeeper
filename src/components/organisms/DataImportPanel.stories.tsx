import type { Meta, StoryObj } from "@storybook/react";

import { DataImportPanel } from "./DataImportPanel";

const meta = {
  component: DataImportPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof DataImportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
