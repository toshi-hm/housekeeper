import type { Meta, StoryObj } from "@storybook/react";

import { ExpiryRecipeSuggestions } from "./ExpiryRecipeSuggestions";

const meta = {
  component: ExpiryRecipeSuggestions,
  tags: ["autodocs"],
} satisfies Meta<typeof ExpiryRecipeSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

// 外部URL(placehold.co)への依存はVRT(#807)のスクリーンショットをネットワーク疎通に
// 応じて不安定にするため、他のStory(StorageLocationMap/LocationPinPicker/ImageUploader)
// と同じdata URIのプレースホルダーに統一する。
const recipeImageDataUrl = (label: string) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='144'%3E%3Crect width='144' height='144' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='16'%3E${label}%3C/text%3E%3C/svg%3E`;

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
        imageUrl: recipeImageDataUrl("Recipe1"),
      },
      {
        id: "2",
        title: "余った野菜のポトフ",
        url: "https://recipe.rakuten.co.jp/recipe/2/",
        imageUrl: recipeImageDataUrl("Recipe2"),
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
