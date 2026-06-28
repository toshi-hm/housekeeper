import { fireEvent, render } from "@testing-library/react";
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
});
