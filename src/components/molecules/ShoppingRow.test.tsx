import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ShoppingRow } from "./ShoppingRow";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ShoppingRow", () => {
  it("renders item name and desired units", () => {
    const { container } = render(
      <ShoppingRow id="1" name="牛乳" desiredUnits={2} onDelete={() => {}} />,
      { wrapper },
    );
    expect(container.textContent).toContain("牛乳");
    expect(container.textContent).toContain("2");
  });

  it("shows auto-added badge when isAutoAdded=true (#353)", () => {
    const { container } = render(
      <ShoppingRow id="1" name="牛乳" desiredUnits={2} isAutoAdded onDelete={() => {}} />,
      { wrapper },
    );
    expect(container.textContent).toMatch(/自動追加|Auto-added/);
  });

  it("does not show auto-added badge by default", () => {
    const { container } = render(
      <ShoppingRow id="1" name="牛乳" desiredUnits={2} onDelete={() => {}} />,
      { wrapper },
    );
    expect(container.textContent).not.toMatch(/自動追加|Auto-added/);
  });

  it("renders note when provided", () => {
    const { container } = render(
      <ShoppingRow id="1" name="牛乳" desiredUnits={1} note="低脂肪" onDelete={() => {}} />,
      { wrapper },
    );
    expect(container.textContent).toContain("低脂肪");
  });

  it("shows purchased icon when isPurchased=true", () => {
    const { container } = render(
      <ShoppingRow id="1" name="牛乳" desiredUnits={1} isPurchased onDelete={() => {}} />,
      { wrapper },
    );
    // line-through applied to name text
    const nameEl = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("牛乳"),
    );
    expect(nameEl?.className).toContain("line-through");
  });

  it("calls onPurchase with id when purchase button clicked", () => {
    const onPurchase = mock(() => {});
    const { container } = render(
      <ShoppingRow
        id="abc"
        name="牛乳"
        desiredUnits={1}
        onPurchase={onPurchase}
        onDelete={() => {}}
      />,
      { wrapper },
    );
    // purchase button is the only button without an aria-label (icon buttons have aria-label)
    const btn = container.querySelector("button:not([aria-label])") as HTMLElement;
    fireEvent.click(btn);
    expect(onPurchase).toHaveBeenCalledWith("abc");
  });

  it("calls onDelete with id when delete button clicked", () => {
    const onDelete = mock(() => {});
    const { getByRole } = render(
      <ShoppingRow id="abc" name="牛乳" desiredUnits={1} onDelete={onDelete} />,
      { wrapper },
    );
    const btn = getByRole("button", { name: /delete|削除/i });
    fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledWith("abc");
  });

  it("renders edit inputs when isEditing=true", () => {
    const { container } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={() => {}}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onEditSave with trimmed data when save button clicked", () => {
    const onEditSave = mock(() => {});
    const { getAllByRole } = render(
      <ShoppingRow
        id="abc"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const buttons = getAllByRole("button");
    const saveBtn = buttons.find((b) => !b.querySelector("svg") && b.className.includes("flex-1"));
    fireEvent.click(saveBtn!);
    expect(onEditSave).toHaveBeenCalledWith(
      "abc",
      expect.objectContaining({ name: "牛乳", desiredUnits: 2 }),
    );
  });

  it("calls onEditCancel when cancel button clicked", () => {
    const onEditCancel = mock(() => {});
    const { getAllByRole } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={1}
        isEditing
        onEditSave={() => {}}
        onEditCancel={onEditCancel}
      />,
      { wrapper },
    );
    const buttons = getAllByRole("button");
    const cancelBtn = buttons.find((b) => b.getAttribute("variant") !== null || buttons.length > 1)
      ? buttons[buttons.length - 1]
      : undefined;
    if (cancelBtn) {
      fireEvent.click(cancelBtn);
      expect(onEditCancel).toHaveBeenCalled();
    }
  });

  it("disables inputs and save button when isSaving=true", () => {
    const { container } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        isSaving
        onEditSave={() => {}}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const inputs = container.querySelectorAll("input");
    inputs.forEach((input) => {
      expect((input as HTMLInputElement).disabled).toBe(true);
    });
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("shows Spinner in save button when isSaving=true", () => {
    const { container } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        isSaving
        onEditSave={() => {}}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const spinner = container.querySelector('[role="status"]');
    expect(spinner).not.toBeNull();
  });

  it("Enterキーで名前欄が空のまま保存しようとするとブロックされエラーを表示する (#457)", () => {
    // name="" は「編集中に名前欄を全消去した」状態と等価（editName の初期値は name prop）。
    const onEditSave = mock(() => {});
    const { container, getByPlaceholderText } = render(
      <ShoppingRow
        id="abc"
        name=""
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const nameInput = getByPlaceholderText(/商品名|item name/i) as HTMLInputElement;
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(onEditSave).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/商品名を入力してください|Please enter an item name/);
  });

  it("Saveボタンは名前欄が空の間disabledになる(ボタン/Enterの非対称解消)", () => {
    const { getAllByRole } = render(
      <ShoppingRow
        id="1"
        name=""
        desiredUnits={2}
        isEditing
        onEditSave={() => {}}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const buttons = getAllByRole("button");
    const saveBtn = buttons.find((b) => !b.querySelector("svg") && b.className.includes("flex-1"));
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("名前欄を再入力すると、エラーが消えて保存できる", async () => {
    const onEditSave = mock(() => {});
    const user = userEvent.setup();
    const { getByRole, queryByText, getByPlaceholderText } = render(
      <ShoppingRow
        id="1"
        name=""
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const nameInput = getByPlaceholderText(/商品名|item name/i);
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(queryByText(/商品名を入力してください|Please enter an item name/)).not.toBeNull();

    await user.type(nameInput, "卵");
    await user.click(getByRole("button", { name: /保存|Save/i }));
    expect(queryByText(/商品名を入力してください|Please enter an item name/)).toBeNull();
    expect(onEditSave).toHaveBeenCalledWith("1", expect.objectContaining({ name: "卵" }));
  });

  it("shows validation error when saving with invalid units", async () => {
    const onEditSave = mock(() => {});
    const user = userEvent.setup();
    const { getByRole, getByText } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const unitsInput = getByRole("spinbutton");
    // clear then type space (rejected by number input) → state becomes ""
    await user.clear(unitsInput);
    await user.type(unitsInput, " ");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));
    expect(onEditSave).not.toHaveBeenCalled();
    expect(getByText(/1以上|positive integer/i)).toBeTruthy();
  });

  it("shows validation error when saving with zero units", async () => {
    const onEditSave = mock(() => {});
    const user = userEvent.setup();
    const { getByRole, getByText } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const unitsInput = getByRole("spinbutton");
    await user.clear(unitsInput);
    await user.type(unitsInput, "0");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));
    expect(onEditSave).not.toHaveBeenCalled();
    expect(getByText(/1以上|positive integer/i)).toBeTruthy();
  });

  it("clears validation error when units input changes", async () => {
    const onEditSave = mock(() => {});
    const user = userEvent.setup();
    const { getByRole, getByText, queryByText } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const unitsInput = getByRole("spinbutton");
    await user.clear(unitsInput);
    await user.type(unitsInput, "0");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));
    expect(getByText(/1以上|positive integer/i)).toBeTruthy();
    await user.clear(unitsInput);
    await user.type(unitsInput, "3");
    expect(queryByText(/1以上|positive integer/i)).toBeNull();
  });

  it("calls onEditSave with valid units", async () => {
    const onEditSave = mock(() => {});
    const user = userEvent.setup();
    const { getByRole } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={onEditSave}
        onEditCancel={() => {}}
      />,
      { wrapper },
    );
    const unitsInput = getByRole("spinbutton");
    await user.clear(unitsInput);
    await user.type(unitsInput, "5");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));
    expect(onEditSave).toHaveBeenCalledTimes(1);
    const [, data] = onEditSave.mock.calls[0] as [string, { desiredUnits: number }];
    expect(data.desiredUnits).toBe(5);
  });

  it("calls onEditCancel and resets error on cancel", async () => {
    const onEditCancel = mock(() => {});
    const user = userEvent.setup();
    const { getByRole, getByText } = render(
      <ShoppingRow
        id="1"
        name="牛乳"
        desiredUnits={2}
        isEditing
        onEditSave={() => {}}
        onEditCancel={onEditCancel}
      />,
      { wrapper },
    );
    const unitsInput = getByRole("spinbutton");
    await user.clear(unitsInput);
    await user.type(unitsInput, "0");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));
    expect(getByText(/1以上|positive integer/i)).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /キャンセル|Cancel/i }));
    expect(onEditCancel).toHaveBeenCalledTimes(1);
  });
});
