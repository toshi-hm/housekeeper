import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { UsageCountBadge } from "./UsageCountBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("UsageCountBadge (#863)", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<UsageCountBadge count={0} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when count is negative", () => {
    const { container } = render(<UsageCountBadge count={-1} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders the usage count when count is positive", () => {
    const { getByText } = render(<UsageCountBadge count={3} />, { wrapper });
    expect(getByText(i18n.t("common:usedByCount", { count: 3 }))).not.toBeNull();
  });

  it("renders the singular form for count=1", () => {
    const { getByText } = render(<UsageCountBadge count={1} />, { wrapper });
    expect(getByText(i18n.t("common:usedByCount", { count: 1 }))).not.toBeNull();
  });
});
