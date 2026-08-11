import type { Meta, StoryObj } from "@storybook/react";

import { MealSlotRecipePicker } from "./MealSlotRecipePicker";

const availableRecipes = [
  { id: "r1", name: "朝のコーヒー" },
  { id: "r2", name: "野菜炒め" },
  { id: "r3", name: "カレー" },
];

const meta = {
  component: MealSlotRecipePicker,
  tags: ["autodocs"],
  args: {
    availableRecipes,
    onSubmit: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof MealSlotRecipePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecipeMode: Story = {
  args: { initialRecipeId: "r2" },
};

export const NoteMode: Story = {
  args: { initialNote: "外食予定" },
};

export const Empty: Story = {
  args: {},
};

export const NoAvailableRecipes: Story = {
  args: { availableRecipes: [] },
};

export const Submitting: Story = {
  args: { initialRecipeId: "r1", isSubmitting: true },
};
