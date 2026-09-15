import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useMealPlansModule from "@/hooks/useMealPlans";
import * as useRecipesModule from "@/hooks/useRecipes";
import * as useRecipeSuggestionsModule from "@/hooks/useRecipeSuggestions";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import { toLocalDateKey } from "@/lib/dateUtils";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Category, Item } from "@/types/item";

import { WeeklyMealPlanner } from "./WeeklyMealPlanner";

const yesterday = toLocalDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "u1",
  name: "牛乳",
  units: 2,
  content_amount: 1000,
  content_unit: "mL",
  category_id: null,
  item_type: null,
  expiry_date: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const dailyGoodsCategory: Category = {
  id: "cat-daily",
  user_id: "u1",
  name: "日用品",
  kind: "daily_goods",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const stubToast: ToastContextValue = { toasts: [], toast: () => "", dismiss: () => {} };
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

describe("WeeklyMealPlanner", () => {
  it("カテゴリを日用品へ切り替えた既存アイテムに残った期限日を『期限間近』のレコメンド対象から除外する (#1073)", () => {
    // 元は食品カテゴリだった時代の expiry_date（昨日 = 期限切れ）が残ったまま
    // カテゴリだけ日用品へ切り替えたアイテム。dropExpiryForDailyGoods を通さないと
    // 「期限間近の食材」として空き枠レコメンドに混入し、外部レシピ提案APIにまで
    // 商品名が送られてしまう。
    const dailyGoodsItem = makeItem({
      id: "item-daily",
      name: "トイレットペーパー",
      category_id: "cat-daily",
      expiry_date: yesterday,
    });
    const foodItem = makeItem({
      id: "item-food",
      name: "豆腐",
      category_id: null,
      expiry_date: yesterday,
    });

    spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [dailyGoodsItem, foodItem],
    } as unknown as ReturnType<typeof useItemsModule.useItems>);

    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [dailyGoodsCategory],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);

    spyOn(useRecipesModule, "useRecipes").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useRecipesModule.useRecipes>);

    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);

    spyOn(useMealPlansModule, "useUpsertMealPlan").mockReturnValue({
      mutate: mock(() => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMealPlansModule.useUpsertMealPlan>);

    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);

    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const suggestionsSpy = spyOn(
      useRecipeSuggestionsModule,
      "useRecipeSuggestions",
    ).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useRecipeSuggestionsModule.useRecipeSuggestions>);

    render(<WeeklyMealPlanner />, { wrapper });

    // internalCandidates は空（recipes=[]）なので、externalSuggestItemNames は
    // urgentItems（期限切れ/期限間近）から作られる。日用品化済みアイテムの名前は
    // 含まれず、食品アイテムの名前だけが渡ることを確認する。
    const lastCallArgs = suggestionsSpy.mock.calls.at(-1);
    expect(lastCallArgs?.[0]).toEqual(["豆腐"]);
    expect(lastCallArgs?.[0]).not.toContain("トイレットペーパー");
  });
});
