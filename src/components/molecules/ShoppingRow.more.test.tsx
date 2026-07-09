import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { ShoppingRow } from "@/components/molecules/ShoppingRow";
import i18n from "@/lib/i18n";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const baseProps = {
  id: "row-1",
  name: "牛乳",
  desiredUnits: 2,
  note: null,
  isPurchased: false,
};

describe("ShoppingRow (編集操作の追加カバレッジ)", () => {
  test("編集ボタンで onEdit が呼ばれる", () => {
    const onEdit = mock(() => {});
    const { getByLabelText } = render(<ShoppingRow {...baseProps} onEdit={onEdit} />, { wrapper });

    fireEvent.click(getByLabelText(i18n.t("shopping:editItem")));
    expect(onEdit).toHaveBeenCalledWith("row-1");
  });

  test("編集中: Enter キーで保存される", () => {
    const onEditSave = mock(() => {});
    const { getAllByRole } = render(
      <ShoppingRow {...baseProps} isEditing onEditSave={onEditSave} />,
      { wrapper },
    );

    const nameInput = getAllByRole("textbox")[0]!;
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(onEditSave).toHaveBeenCalledWith("row-1", {
      name: "牛乳",
      desiredUnits: 2,
      note: null,
    });
  });

  test("編集中: Escape キーでキャンセルされる", () => {
    const onEditCancel = mock(() => {});
    const { getAllByRole } = render(
      <ShoppingRow {...baseProps} isEditing onEditCancel={onEditCancel} />,
      { wrapper },
    );

    const nameInput = getAllByRole("textbox")[0]!;
    fireEvent.keyDown(nameInput, { key: "Escape" });

    expect(onEditCancel).toHaveBeenCalled();
  });
});
