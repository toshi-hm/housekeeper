import type { Meta, StoryObj } from "@storybook/react";

import { ExpiryRecipeSuggestions } from "./ExpiryRecipeSuggestions";

const meta = {
  component: ExpiryRecipeSuggestions,
  tags: ["autodocs"],
} satisfies Meta<typeof ExpiryRecipeSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { isLoading: true, suggestions: [] },
};

export const WithSuggestions: Story = {
  args: {
    isLoading: false,
    suggestions: [
      {
        id: "1",
        title: "牛乳と卵のフレンチトースト",
        url: "https://recipe.rakuten.co.jp/recipe/1/",
        imageUrl: "https://placehold.co/144x144?text=Recipe1",
      },
      {
        id: "2",
        title: "余った野菜のポトフ",
        url: "https://recipe.rakuten.co.jp/recipe/2/",
        imageUrl: "https://placehold.co/144x144?text=Recipe2",
      },
      {
        id: "3",
        title: "使い切りヨーグルトのスムージー",
        url: "https://recipe.rakuten.co.jp/recipe/3/",
        imageUrl: null,
      },
    ],
  },
};

export const NoImage: Story = {
  args: {
    isLoading: false,
    suggestions: [
      {
        id: "1",
        title: "画像なしレシピのサンプル",
        url: "https://recipe.rakuten.co.jp/recipe/1/",
        imageUrl: null,
      },
    ],
  },
};

// RECIPE_API_KEY unset, external API error, or no matching recipes all
// resolve to an empty list — the component renders nothing (#461).
export const Empty: Story = {
  args: { isLoading: false, suggestions: [] },
};
