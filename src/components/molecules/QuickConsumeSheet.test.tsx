import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { QuickConsumeSheet } from "./QuickConsumeSheet";

// テスト実行時に言語検出が非同期で確定するため、日英どちらの表示でもマッチするようにする
const CLOSE_NAME = /閉じる|Close/i;

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const baseProps = {
  itemName: "牛乳",
  units: 2,
  contentAmount: 1000,
  contentUnit: "mL",
  openedRemaining: null as number | null,
  onConsumeOne: () => {},
  onConsumePartial: () => {},
  onAddNewItem: () => {},
  onClose: () => {},
};

describe("QuickConsumeSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<QuickConsumeSheet {...baseProps} open={false} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("shows the item name and current stock (sealed lot, no opened_remaining)", () => {
    const { container, getByRole } = render(<QuickConsumeSheet {...baseProps} open={true} />, {
      wrapper,
    });
    expect(container.textContent).toContain("牛乳");
    expect(container.textContent).toContain("2000");
    expect(getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("shows the combined remaining amount when a lot is opened", () => {
    const { container } = render(
      <QuickConsumeSheet {...baseProps} open={true} units={2} openedRemaining={300} />,
      { wrapper },
    );
    // getLotRemainingAmount(2, 1000, 300) = (2-1)*1000 + 300 = 1300
    expect(container.textContent).toContain("1300");
  });

  it("calls onConsumeOne when the '1点使う' button is clicked", () => {
    const onConsumeOne = mock(() => {});
    const { getByText } = render(
      <QuickConsumeSheet {...baseProps} open={true} onConsumeOne={onConsumeOne} />,
      { wrapper },
    );
    fireEvent.click(getByText(/1点使う|Use 1 \(/));
    expect(onConsumeOne).toHaveBeenCalledTimes(1);
  });

  it("calls onConsumePartial when the '一部使用' button is clicked", () => {
    const onConsumePartial = mock(() => {});
    const { getByText } = render(
      <QuickConsumeSheet {...baseProps} open={true} onConsumePartial={onConsumePartial} />,
      { wrapper },
    );
    fireEvent.click(getByText(/一部使用|Use a partial amount/));
    expect(onConsumePartial).toHaveBeenCalledTimes(1);
  });

  it("calls onAddNewItem when the escape link is clicked", () => {
    const onAddNewItem = mock(() => {});
    const { getByText } = render(
      <QuickConsumeSheet {...baseProps} open={true} onAddNewItem={onAddNewItem} />,
      { wrapper },
    );
    fireEvent.click(getByText(/新規登録として追加する|Add as a new item instead/));
    expect(onAddNewItem).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = mock(() => {});
    const { getByRole } = render(
      <QuickConsumeSheet {...baseProps} open={true} onClose={onClose} />,
      {
        wrapper,
      },
    );
    fireEvent.click(getByRole("button", { name: CLOSE_NAME }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables every action while isConsuming is true", () => {
    const { container } = render(
      <QuickConsumeSheet {...baseProps} open={true} isConsuming={true} />,
      { wrapper },
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
