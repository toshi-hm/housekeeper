import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { WasteStreakBadge } from "./WasteStreakBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("WasteStreakBadge (#925)", () => {
  it("renders nothing when the streak is 0", () => {
    const { container } = render(<WasteStreakBadge currentStreakWeeks={0} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a negative streak", () => {
    const { container } = render(<WasteStreakBadge currentStreakWeeks={-1} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders the streak count when positive", () => {
    const { getByText } = render(<WasteStreakBadge currentStreakWeeks={3} />, { wrapper });
    expect(getByText(i18n.t("stats:wasteStreak", { count: 3 }))).not.toBeNull();
  });

  it("renders the singular form for a 1-week streak", () => {
    const { getByText } = render(<WasteStreakBadge currentStreakWeeks={1} />, { wrapper });
    expect(getByText(i18n.t("stats:wasteStreak", { count: 1 }))).not.toBeNull();
  });
});
