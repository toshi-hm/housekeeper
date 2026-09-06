import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { SimilarItemSuggestion } from "./SimilarItemSuggestion";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("SimilarItemSuggestion", () => {
  it("renders the matched item name", () => {
    const { container } = render(
      <SimilarItemSuggestion matchName="たまねぎ" onViewMatch={() => {}} />,
      { wrapper },
    );
    expect(container.textContent).toContain("たまねぎ");
  });

  it("exposes the notice via role=status (non-blocking, non-modal)", () => {
    const { getByRole } = render(
      <SimilarItemSuggestion matchName="たまねぎ" onViewMatch={() => {}} />,
      { wrapper },
    );
    expect(getByRole("status")).toBeTruthy();
  });

  it("calls onViewMatch when the view link is clicked", () => {
    const onViewMatch = mock(() => {});
    const { getByRole } = render(
      <SimilarItemSuggestion matchName="たまねぎ" onViewMatch={onViewMatch} />,
      { wrapper },
    );
    fireEvent.click(getByRole("button"));
    expect(onViewMatch).toHaveBeenCalledTimes(1);
  });
});
