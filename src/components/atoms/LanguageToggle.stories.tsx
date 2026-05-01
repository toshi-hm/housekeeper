import type { Meta, StoryObj } from "@storybook/react";

import { LanguageToggle } from "./LanguageToggle";

const meta = {
  component: LanguageToggle,
  tags: ["autodocs"],
} satisfies Meta<typeof LanguageToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Japanese: Story = {
  args: { value: "ja", onChange: () => {} },
};

export const English: Story = {
  args: { value: "en", onChange: () => {} },
};
