import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import type { ItemConsumptionPace } from "@/types/stats";

import i18n from "../../lib/i18n";
import { ItemConsumptionMiniChart } from "./ItemConsumptionMiniChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const paceWithData: ItemConsumptionPace = {
  monthly: [
    { month: "2026/05", totals: [{ unit: "mL", total: 1200 }] },
    { month: "2026/06", totals: [{ unit: "mL", total: 900 }] },
    { month: "2026/07", totals: [{ unit: "mL", total: 1500 }] },
  ],
  averagePerMonth: 1200,
  unit: "mL",
  estimatedWeeksRemaining: 2.3,
};

const emptyPace: ItemConsumptionPace = {
  monthly: [
    { month: "2026/05", totals: [] },
    { month: "2026/06", totals: [] },
    { month: "2026/07", totals: [] },
  ],
  averagePerMonth: 0,
  unit: null,
  estimatedWeeksRemaining: null,
};

describe("ItemConsumptionMiniChart", () => {
  it("shows the insufficient-data message when no logs exist in the period", () => {
    const { getByText, queryByTestId } = render(<ItemConsumptionMiniChart pace={emptyPace} />, {
      wrapper,
    });
    expect(getByText(i18n.t("consumptionPaceInsufficientData", { ns: "items" }))).toBeTruthy();
    expect(queryByTestId("average-per-month")).toBeNull();
  });

  it("shows the average-per-month summary when data exists", () => {
    const { getByText } = render(<ItemConsumptionMiniChart pace={paceWithData} />, { wrapper });
    expect(
      getByText(
        i18n.t("consumptionPaceAveragePerMonth", {
          ns: "items",
          amount: paceWithData.averagePerMonth,
          unit: paceWithData.unit,
        }),
      ),
    ).toBeTruthy();
  });

  it("shows the estimated-weeks-remaining summary when it is not null", () => {
    const { getByText } = render(<ItemConsumptionMiniChart pace={paceWithData} />, { wrapper });
    expect(
      getByText(
        i18n.t("consumptionPaceEstimatedWeeks", {
          ns: "items",
          weeks: paceWithData.estimatedWeeksRemaining,
        }),
      ),
    ).toBeTruthy();
  });

  it("omits the estimated-weeks-remaining summary when pace cannot be computed", () => {
    const pace: ItemConsumptionPace = { ...paceWithData, estimatedWeeksRemaining: null };
    const { queryByTestId } = render(<ItemConsumptionMiniChart pace={pace} />, { wrapper });
    expect(queryByTestId("estimated-weeks-remaining")).toBeNull();
  });

  it("shows a zero-week summary when stock is already depleted", () => {
    const pace: ItemConsumptionPace = { ...paceWithData, estimatedWeeksRemaining: 0 };
    const { getByText } = render(<ItemConsumptionMiniChart pace={pace} />, { wrapper });
    expect(
      getByText(i18n.t("consumptionPaceEstimatedWeeks", { ns: "items", weeks: 0 })),
    ).toBeTruthy();
  });
});
