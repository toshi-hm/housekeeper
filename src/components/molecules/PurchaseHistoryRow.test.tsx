import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { PurchaseHistoryRow } from "./PurchaseHistoryRow";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("PurchaseHistoryRow", () => {
  it("renders item name and desired units", () => {
    const { container } = render(<PurchaseHistoryRow id="1" name="牛乳" desiredUnits={2} />, {
      wrapper,
    });
    expect(container.textContent).toContain("牛乳");
    expect(container.textContent).toContain("2");
  });

  it("renders note when provided", () => {
    const { container } = render(
      <PurchaseHistoryRow id="1" name="牛乳" desiredUnits={1} note="低脂肪" />,
      { wrapper },
    );
    expect(container.textContent).toContain("低脂肪");
  });

  it("does not render a restock button when onRestock is omitted", () => {
    const { container } = render(<PurchaseHistoryRow id="1" name="牛乳" desiredUnits={1} />, {
      wrapper,
    });
    expect(container.querySelector("button")).toBeNull();
  });

  it("calls onRestock with id when the restock button is clicked", () => {
    const onRestock = mock(() => {});
    const { container } = render(
      <PurchaseHistoryRow id="abc" name="牛乳" desiredUnits={1} onRestock={onRestock} />,
      { wrapper },
    );
    const btn = container.querySelector("button") as HTMLElement;
    fireEvent.click(btn);
    expect(onRestock).toHaveBeenCalledWith("abc");
  });

  it("disables the restock button while isRestocking is true", () => {
    const { container } = render(
      <PurchaseHistoryRow
        id="abc"
        name="牛乳"
        desiredUnits={1}
        onRestock={() => {}}
        isRestocking
      />,
      { wrapper },
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
