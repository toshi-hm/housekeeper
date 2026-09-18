import { render } from "@testing-library/react";
import { describe, expect, it, spyOn } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useStatsModule from "@/hooks/useStats";
import i18n from "@/lib/i18n";

import { BudgetBanner, BudgetBannerView } from "./BudgetBanner";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("BudgetBannerView (#991)", () => {
  it("shows the normal (secondary) treatment under 80%", () => {
    const { getByRole, getByText } = render(
      <BudgetBannerView
        status={{ monthlyBudget: 30000, currentSpend: 15000, percentUsed: 50, tier: "normal" }}
      />,
      { wrapper },
    );
    expect(getByRole("status")).not.toBeNull();
    expect(getByText(/50/)).not.toBeNull();
    expect(getByText("¥15,000 / ¥30,000")).not.toBeNull();
  });

  it("shows the caution treatment at 80% and above", () => {
    const { getByText } = render(
      <BudgetBannerView
        status={{ monthlyBudget: 30000, currentSpend: 25500, percentUsed: 85, tier: "caution" }}
      />,
      { wrapper },
    );
    expect(getByText(/85/)).not.toBeNull();
    expect(getByText(/注意|Caution/i)).not.toBeNull();
  });

  it("shows the over-budget (destructive) treatment at 100% and above", () => {
    const { getByText } = render(
      <BudgetBannerView
        status={{ monthlyBudget: 30000, currentSpend: 39000, percentUsed: 130, tier: "over" }}
      />,
      { wrapper },
    );
    expect(getByText(/130/)).not.toBeNull();
    expect(getByText(/予算超過|Over budget/i)).not.toBeNull();
  });
});

describe("BudgetBanner (container, #991)", () => {
  it("renders nothing while useBudgetStatus is loading, to avoid a false-positive flash", () => {
    const spy = spyOn(useStatsModule, "useBudgetStatus").mockReturnValue({
      status: null,
      isLoading: true,
      isError: false,
      refetch: () => {},
    });

    const { queryByRole } = render(<BudgetBanner />, { wrapper });
    expect(queryByRole("status")).toBeNull();

    spy.mockRestore();
  });

  it("renders nothing when monthly_budget is unset (status: null) — zero impact for non-users", () => {
    const spy = spyOn(useStatsModule, "useBudgetStatus").mockReturnValue({
      status: null,
      isLoading: false,
      isError: false,
      refetch: () => {},
    });

    const { queryByRole } = render(<BudgetBanner />, { wrapper });
    expect(queryByRole("status")).toBeNull();

    spy.mockRestore();
  });

  it("renders the banner when a budget status is available", () => {
    const spy = spyOn(useStatsModule, "useBudgetStatus").mockReturnValue({
      status: { monthlyBudget: 30000, currentSpend: 27000, percentUsed: 90, tier: "caution" },
      isLoading: false,
      isError: false,
      refetch: () => {},
    });

    const { getByRole } = render(<BudgetBanner />, { wrapper });
    expect(getByRole("status")).not.toBeNull();

    spy.mockRestore();
  });

  it("renders an inline error with a retry action instead of hiding silently (#1077)", () => {
    const refetch = () => {};
    const spy = spyOn(useStatsModule, "useBudgetStatus").mockReturnValue({
      status: null,
      isLoading: false,
      isError: true,
      refetch,
    });

    const { getByRole, queryByText } = render(<BudgetBanner />, { wrapper });
    expect(getByRole("alert")).not.toBeNull();
    expect(getByRole("button", { name: /再試行|Retry/i })).not.toBeNull();
    // Distinct from the "budget not set" silent-hide path: no status text is rendered.
    expect(queryByText(/予算未設定|budget/i)).toBeNull();

    spy.mockRestore();
  });

  it("does not render the normal status banner while an error is present", () => {
    const spy = spyOn(useStatsModule, "useBudgetStatus").mockReturnValue({
      status: null,
      isLoading: false,
      isError: true,
      refetch: () => {},
    });

    const { queryByRole } = render(<BudgetBanner />, { wrapper });
    expect(queryByRole("alert")).not.toBeNull();
    expect(queryByRole("status")).toBeNull();

    spy.mockRestore();
  });
});
