import type { Meta, StoryObj } from "@storybook/react";

import { MealSlot } from "./MealSlot";

const availableRecipes = [
  { id: "r1", name: "朝のコーヒー" },
  { id: "r2", name: "野菜炒め" },
];

const recipe = {
  id: "r2",
  user_id: "u1",
  name: "野菜炒め",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items: [
    { id: "ri1", recipe_id: "r2", item_id: "i1", amount: 1, created_at: "2026-01-01T00:00:00Z" },
  ],
};

const meta = {
  component: MealSlot,
  tags: ["autodocs"],
  args: {
    date: "2026-08-12",
    isToday: false,
    availableRecipes,
    stockCheck: null,
    recommendation: null,
    onStartEdit: () => {},
    onCancelEdit: () => {},
    onSaveAssignment: () => {},
    onUnassign: () => {},
    onAddMissingToShoppingList: () => {},
    onExecute: () => {},
    onAssignRecommendedRecipe: () => {},
  },
} satisfies Meta<typeof MealSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

const basePlan = {
  id: "mp1",
  user_id: "u1",
  planned_date: "2026-08-12",
  recipe_id: null,
  note: null,
  executed_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

export const Empty: Story = {
  args: { plan: null, isEditing: false },
};

export const EmptyWithRecommendation: Story = {
  args: {
    plan: null,
    isEditing: false,
    recommendation: {
      internalCandidates: [{ recipe, matchingExpiringCount: 2 }],
      externalSuggestions: [],
      isLoadingExternal: false,
    },
  },
};

export const RecipeAssigned: Story = {
  args: {
    plan: { ...basePlan, recipe_id: recipe.id, recipe },
    isEditing: false,
    stockCheck: { ok: true, shortages: [] },
  },
};

export const RecipeAssignedWithShortage: Story = {
  args: {
    plan: { ...basePlan, recipe_id: recipe.id, recipe },
    isEditing: false,
    stockCheck: {
      ok: false,
      shortages: [{ item_id: "i1", item_name: "にんじん", required: 2, available: 0, unit: "本" }],
    },
  },
};

export const NoteAssigned: Story = {
  args: {
    plan: { ...basePlan, note: "外食予定", recipe: null },
    isEditing: false,
  },
};

export const Executed: Story = {
  args: {
    plan: { ...basePlan, recipe_id: recipe.id, recipe, executed_at: "2026-08-12T18:00:00Z" },
    isEditing: false,
    stockCheck: { ok: true, shortages: [] },
  },
};

export const Editing: Story = {
  args: {
    plan: null,
    isEditing: true,
  },
};

export const Today: Story = {
  args: {
    plan: null,
    isEditing: false,
    isToday: true,
  },
};
