import type { Meta, StoryObj } from "@storybook/react";

import { MealPlanExpiryRecommendation } from "./MealPlanExpiryRecommendation";

const recipe = (id: string, name: string) => ({
  id,
  user_id: "u1",
  name,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items: [],
});

const meta = {
  component: MealPlanExpiryRecommendation,
  tags: ["autodocs"],
  args: {
    onAssignRecipe: () => {},
  },
} satisfies Meta<typeof MealPlanExpiryRecommendation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InternalCandidates: Story = {
  args: {
    internalCandidates: [
      { recipe: recipe("r1", "野菜炒め"), matchingExpiringCount: 3 },
      { recipe: recipe("r2", "ポトフ"), matchingExpiringCount: 1 },
    ],
    externalSuggestions: [],
    isLoadingExternal: false,
  },
};

export const ExternalFallback: Story = {
  args: {
    internalCandidates: [],
    externalSuggestions: [
      {
        id: "1",
        title: "余った野菜のポトフ",
        url: "https://recipe.rakuten.co.jp/recipe/1/",
        imageUrl: null,
      },
    ],
    isLoadingExternal: false,
  },
};

export const LoadingExternal: Story = {
  args: { internalCandidates: [], externalSuggestions: [], isLoadingExternal: true },
};

export const Empty: Story = {
  args: { internalCandidates: [], externalSuggestions: [], isLoadingExternal: false },
};
