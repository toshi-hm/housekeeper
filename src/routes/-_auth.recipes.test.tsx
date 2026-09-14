import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import * as useRecipesModule from "@/hooks/useRecipes";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { RecipeWithItems } from "@/types/recipe";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside RecipesPage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { RecipesPage } from "./_auth.recipes";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => "toast-id", dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <routerContext.Provider value={stubRouter}>
          <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
        </routerContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

const renderPage = () => render(<RecipesPage />, { wrapper: Wrapper as React.ComponentType });

const noItemsRecipe: RecipeWithItems = {
  id: "recipe-empty",
  user_id: "user-1",
  name: "空のレシピ",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items: [],
};

const withItemsRecipe: RecipeWithItems = {
  id: "recipe-full",
  user_id: "user-1",
  name: "朝のコーヒー",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items: [
    {
      id: "ri-1",
      recipe_id: "recipe-full",
      item_id: "item-1",
      amount: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("RecipesPage — 実行ボタン無効化理由の明示 (#1058)", () => {
  let recipesSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let saveSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let executeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    recipesSpy = spyOn(useRecipesModule, "useRecipes").mockReturnValue({
      data: [noItemsRecipe, withItemsRecipe],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRecipesModule.useRecipes>);
    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useItemsModule.useItems>);
    saveSpy = spyOn(useRecipesModule, "useSaveRecipe").mockReturnValue({
      mutate: mock(() => {}),
    } as unknown as ReturnType<typeof useRecipesModule.useSaveRecipe>);
    deleteSpy = spyOn(useRecipesModule, "useDeleteRecipe").mockReturnValue({
      mutate: mock(() => {}),
    } as unknown as ReturnType<typeof useRecipesModule.useDeleteRecipe>);
    executeSpy = spyOn(useRecipesModule, "useExecuteRecipe").mockReturnValue({
      mutateAsync: mock(async () => ({
        consumedItemIds: [],
        skippedItemIds: [],
        failedItemIds: [],
      })),
    } as unknown as ReturnType<typeof useRecipesModule.useExecuteRecipe>);
  });

  afterEach(() => {
    recipesSpy.mockRestore();
    itemsSpy.mockRestore();
    saveSpy.mockRestore();
    deleteSpy.mockRestore();
    executeSpy.mockRestore();
    cleanup();
  });

  it("構成アイテムが0件のレシピの実行ボタンにtitleとaria-describedbyで理由が示される", () => {
    const { getAllByRole, getByText } = renderPage();
    const executeButtons = getAllByRole("button", { name: i18n.t("recipes:execute") });
    const disabledButton = executeButtons[0];
    expect(disabledButton.hasAttribute("disabled")).toBe(true);
    expect(disabledButton.getAttribute("title")).toBe(i18n.t("recipes:executeDisabledNoItems"));
    const describedById = disabledButton.getAttribute("aria-describedby");
    expect(describedById).toBe("recipe-no-items-recipe-empty");
    expect(getByText(i18n.t("recipes:executeDisabledNoItems"))).toBeDefined();
  });

  it("構成アイテムがあるレシピの実行ボタンにはtitle/aria-describedbyが付与されない", () => {
    const { getAllByRole } = renderPage();
    const executeButtons = getAllByRole("button", { name: i18n.t("recipes:execute") });
    const enabledButton = executeButtons[1];
    expect(enabledButton.hasAttribute("disabled")).toBe(false);
    expect(enabledButton.getAttribute("title")).toBeNull();
    expect(enabledButton.getAttribute("aria-describedby")).toBeNull();
  });
});
