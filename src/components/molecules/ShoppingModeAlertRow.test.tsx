import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ShoppingModeAlertRow } from "./ShoppingModeAlertRow";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ShoppingModeAlertRow", () => {
  it("renders the item name", () => {
    const { container } = render(<ShoppingModeAlertRow name="醤油" />, { wrapper });
    expect(container.textContent).toContain("醤油");
  });

  it("renders detail text when provided", () => {
    const { container } = render(<ShoppingModeAlertRow name="醤油" detail="在庫 1 / 最低 3" />, {
      wrapper,
    });
    expect(container.textContent).toContain("在庫 1 / 最低 3");
  });

  it("does not render detail text by default", () => {
    const { container } = render(<ShoppingModeAlertRow name="醤油" />, { wrapper });
    expect(container.querySelectorAll("p").length).toBe(1);
  });

  it("renders the badge slot when provided", () => {
    const { getByText } = render(
      <ShoppingModeAlertRow name="牛乳" badge={<span>期限間近</span>} />,
      { wrapper },
    );
    expect(getByText("期限間近")).toBeTruthy();
  });

  it("does not render an add button when onAdd is not provided", () => {
    const { queryByRole } = render(<ShoppingModeAlertRow name="醤油" />, { wrapper });
    expect(queryByRole("button")).toBeNull();
  });

  it("calls onAdd when the add button is clicked", () => {
    const onAdd = mock(() => {});
    const { getByRole } = render(<ShoppingModeAlertRow name="醤油" onAdd={onAdd} />, { wrapper });
    fireEvent.click(getByRole("button"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows the added label and disables the button when isAdded=true", () => {
    const onAdd = mock(() => {});
    const { getByRole } = render(<ShoppingModeAlertRow name="醤油" onAdd={onAdd} isAdded />, {
      wrapper,
    });
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("disables the button when isPending=true", () => {
    const { getByRole } = render(<ShoppingModeAlertRow name="醤油" onAdd={() => {}} isPending />, {
      wrapper,
    });
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
