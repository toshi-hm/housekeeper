import type { Meta, StoryObj } from "@storybook/react";

import { CooccurrenceSuggestion } from "./CooccurrenceSuggestion";

const meta = {
  component: CooccurrenceSuggestion,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof CooccurrenceSuggestion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoSuggestions: Story = {
  args: {
    suggestions: ["パン", "卵"],
    onAdd: () => {},
    onDismiss: () => {},
  },
};

export const OneSuggestion: Story = {
  args: {
    suggestions: ["パン"],
    onAdd: () => {},
    onDismiss: () => {},
  },
};

export const Empty: Story = {
  args: {
    suggestions: [],
    onAdd: () => {},
    onDismiss: () => {},
  },
};
