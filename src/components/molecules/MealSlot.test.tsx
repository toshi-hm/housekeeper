import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { MealSlot } from "./MealSlot";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const recipe = {
  id: "r1",
  user_id: "u1",
  name: "野菜炒め",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  items: [
    { id: "ri1", recipe_id: "r1", item_id: "i1", amount: 1, created_at: "2026-01-01T00:00:00Z" },
  ],
};

const basePlan = {
  id: "mp1",
  user_id: "u1",
  planned_date: "2026-08-12",
  recipe_id: recipe.id,
  note: null,
  executed_at: null as string | null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  recipe,
};

const baseProps = {
  date: "2026-08-12",
  isToday: false,
  availableRecipes: [{ id: recipe.id, name: recipe.name }],
  stockCheck: { ok: true, shortages: [] },
  recommendation: null,
  isEditing: false,
  onStartEdit: () => {},
  onCancelEdit: () => {},
  onSaveAssignment: () => {},
  onAddMissingToShoppingList: () => {},
  onExecute: () => {},
  onAssignRecommendedRecipe: () => {},
};

describe("MealSlot #872: 実行済み枠の解除・変更ガード", () => {
  it("未実行の枠では割り当て解除ボタンを押すと確認なしにonUnassignを呼ぶ", () => {
    const onUnassign = mock(() => undefined);
    const { getByRole, queryByRole } = render(
      <MealSlot {...baseProps} plan={{ ...basePlan, executed_at: null }} onUnassign={onUnassign} />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:unassign") }));

    expect(onUnassign).toHaveBeenCalledTimes(1);
    expect(queryByRole("alertdialog")).toBeNull();
  });

  it("実行済みの枠で割り当て解除ボタンを押しても、確認ダイアログが出るまでonUnassignは呼ばれない", () => {
    const onUnassign = mock(() => undefined);
    const { getByRole } = render(
      <MealSlot
        {...baseProps}
        plan={{ ...basePlan, executed_at: "2026-08-12T18:00:00Z" }}
        onUnassign={onUnassign}
      />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:unassign") }));

    expect(onUnassign).not.toHaveBeenCalled();
    expect(getByRole("alertdialog")).toBeDefined();
  });

  it("実行済みの枠の確認ダイアログでキャンセルすると、onUnassignは呼ばれずダイアログが閉じる", () => {
    const onUnassign = mock(() => undefined);
    const { getByRole, queryByRole, getByText } = render(
      <MealSlot
        {...baseProps}
        plan={{ ...basePlan, executed_at: "2026-08-12T18:00:00Z" }}
        onUnassign={onUnassign}
      />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:unassign") }));
    fireEvent.click(getByText(i18n.t("cancel")));

    expect(onUnassign).not.toHaveBeenCalled();
    expect(queryByRole("alertdialog")).toBeNull();
  });

  it("実行済みの枠の確認ダイアログで確定すると、onUnassignが呼ばれる", () => {
    const onUnassign = mock(() => undefined);
    const { getByRole, queryByRole, getAllByText } = render(
      <MealSlot
        {...baseProps}
        plan={{ ...basePlan, executed_at: "2026-08-12T18:00:00Z" }}
        onUnassign={onUnassign}
      />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:unassign") }));
    // 確認ダイアログの確定ボタン(ラベルは "unassign" キーを再利用)を押す
    const confirmButtons = getAllByText(i18n.t("mealPlan:unassign"));
    fireEvent.click(confirmButtons[confirmButtons.length - 1] as HTMLElement);

    expect(onUnassign).toHaveBeenCalledTimes(1);
    expect(queryByRole("alertdialog")).toBeNull();
  });

  it("実行済みの枠で変更(鉛筆)ボタンを押しても、確認ダイアログが出るまでonStartEditは呼ばれない", () => {
    const onStartEdit = mock(() => undefined);
    const { getByRole } = render(
      <MealSlot
        {...baseProps}
        plan={{ ...basePlan, executed_at: "2026-08-12T18:00:00Z" }}
        onUnassign={() => {}}
        onStartEdit={onStartEdit}
      />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:changeRecipe") }));

    expect(onStartEdit).not.toHaveBeenCalled();
    expect(getByRole("alertdialog")).toBeDefined();
  });

  it("未実行の枠では変更(鉛筆)ボタンを押すと確認なしにonStartEditを呼ぶ", () => {
    const onStartEdit = mock(() => undefined);
    const { getByRole } = render(
      <MealSlot
        {...baseProps}
        plan={{ ...basePlan, executed_at: null }}
        onUnassign={() => {}}
        onStartEdit={onStartEdit}
      />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:changeRecipe") }));

    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });
});
