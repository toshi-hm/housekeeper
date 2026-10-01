import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { CooccurrenceSuggestion } from "./CooccurrenceSuggestion";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("CooccurrenceSuggestion", () => {
  it("renders nothing when there are no suggestions", () => {
    const { container } = render(
      <CooccurrenceSuggestion suggestions={[]} onAdd={() => {}} onDismiss={() => {}} />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a chip per suggestion", () => {
    const { getByRole } = render(
      <CooccurrenceSuggestion suggestions={["パン", "卵"]} onAdd={() => {}} onDismiss={() => {}} />,
      { wrapper },
    );
    expect(getByRole("button", { name: /パン/ })).toBeTruthy();
    expect(getByRole("button", { name: /卵/ })).toBeTruthy();
  });

  it("calls onAdd with the suggestion name when its chip is tapped", () => {
    const onAdd = mock(() => {});
    const { getByRole } = render(
      <CooccurrenceSuggestion suggestions={["パン"]} onAdd={onAdd} onDismiss={() => {}} />,
      { wrapper },
    );
    fireEvent.click(getByRole("button", { name: /パン/ }));
    expect(onAdd).toHaveBeenCalledWith("パン");
  });

  it("calls onDismiss when the close button is tapped", () => {
    const onDismiss = mock(() => {});
    const { getByRole } = render(
      <CooccurrenceSuggestion suggestions={["パン"]} onAdd={() => {}} onDismiss={onDismiss} />,
      { wrapper },
    );
    fireEvent.click(getByRole("button", { name: i18n.t("common:close") }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
