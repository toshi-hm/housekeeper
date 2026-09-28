import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { Item } from "@/types/item";

import { RecipeForm } from "./RecipeForm";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const availableItems: Pick<Item, "id" | "name" | "content_unit">[] = [
  { id: "item-1", name: "コーヒー豆", content_unit: "g" },
  { id: "item-2", name: "フィルター", content_unit: "個" },
];

describe("RecipeForm", () => {
  it("submits the entered name and rows", async () => {
    const user = userEvent.setup();
    const onSubmit = mock(() => {});
    const { getByLabelText, getByText } = render(
      <RecipeForm availableItems={availableItems} onSubmit={onSubmit} onCancel={() => {}} />,
      { wrapper },
    );

    await user.type(getByLabelText(i18n.t("recipes:recipeName")), "朝のコーヒー");
    fireEvent.click(getByText(i18n.t("common:save")));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "朝のコーヒー",
      items: [{ item_id: "item-1", amount: 1 }],
    });
  });

  it("does not submit when the name is empty", () => {
    const onSubmit = mock(() => {});
    const { getByText } = render(
      <RecipeForm availableItems={availableItems} onSubmit={onSubmit} onCancel={() => {}} />,
      { wrapper },
    );

    fireEvent.click(getByText(i18n.t("common:save")));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submission and shows an inline error when a row's amount is 0 (#1127)", async () => {
    const user = userEvent.setup();
    const onSubmit = mock(() => {});
    const { getByLabelText, getByText, queryByText } = render(
      <RecipeForm availableItems={availableItems} onSubmit={onSubmit} onCancel={() => {}} />,
      { wrapper },
    );

    await user.type(getByLabelText(i18n.t("recipes:recipeName")), "朝のコーヒー");
    expect(queryByText(i18n.t("recipes:recipeAmountError"))).toBeNull();

    const amountInput = getByLabelText(i18n.t("recipes:recipeItemAmount"));
    await user.clear(amountInput);
    await user.type(amountInput, "0");

    expect(getByText(i18n.t("recipes:recipeAmountError"))).toBeTruthy();
    expect(amountInput.getAttribute("aria-invalid")).toBe("true");

    fireEvent.click(getByText(i18n.t("common:save")));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("re-enables submission once the invalid row's amount is fixed", async () => {
    const user = userEvent.setup();
    const onSubmit = mock(() => {});
    const { getByLabelText, getByText, queryByText } = render(
      <RecipeForm availableItems={availableItems} onSubmit={onSubmit} onCancel={() => {}} />,
      { wrapper },
    );

    await user.type(getByLabelText(i18n.t("recipes:recipeName")), "朝のコーヒー");
    const amountInput = getByLabelText(i18n.t("recipes:recipeItemAmount"));
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.clear(amountInput);
    await user.type(amountInput, "3");

    expect(queryByText(i18n.t("recipes:recipeAmountError"))).toBeNull();
    fireEvent.click(getByText(i18n.t("common:save")));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "朝のコーヒー",
      items: [{ item_id: "item-1", amount: 3 }],
    });
  });

  it("blocks submission and shows an inline error when a row has no item selected", () => {
    const onSubmit = mock(() => {});
    const { getByText, getByLabelText } = render(
      <RecipeForm
        availableItems={availableItems}
        defaultValues={{ name: "朝のコーヒー", items: [{ item_id: "", amount: 1 }] }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
      { wrapper },
    );

    expect(getByText(i18n.t("recipes:recipeItemRequiredError"))).toBeTruthy();
    expect(getByLabelText(i18n.t("recipes:recipeItemSelect")).getAttribute("aria-invalid")).toBe(
      "true",
    );

    fireEvent.click(getByText(i18n.t("common:save")));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a hint and disables submission when there are no available items", () => {
    const onSubmit = mock(() => {});
    const { getByText, queryByLabelText } = render(
      <RecipeForm availableItems={[]} onSubmit={onSubmit} onCancel={() => {}} />,
      { wrapper },
    );

    expect(getByText(i18n.t("recipes:noAvailableItems"))).toBeTruthy();
    expect(queryByLabelText(i18n.t("recipes:recipeItemAmount"))).toBeNull();
    fireEvent.click(getByText(i18n.t("common:save")));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
