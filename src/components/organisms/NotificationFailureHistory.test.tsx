import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { NotificationFailureHistory } from "./NotificationFailureHistory";

describe("NotificationFailureHistory", () => {
  it("shows the empty state when there are no failures", () => {
    const { getByText } = render(<NotificationFailureHistory failures={[]} />, {
      wrapper: ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>,
    });

    expect(getByText(/失敗履歴はありません|No delivery failures/i)).toBeTruthy();
  });

  it("shows the channel and localized reason for a recorded failure", () => {
    const { container, getByText } = render(
      <NotificationFailureHistory
        failures={[
          {
            id: "failure-1",
            notification_type: "expiry",
            channel: "email",
            failure_code: "email_delivery_failed",
            failed_at: "2026-10-02T01:00:00.000Z",
          },
        ]}
      />,
      { wrapper: ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider> },
    );

    expect(container.querySelector("li")?.textContent).toMatch(/メール|Email/);
    expect(getByText(/メール配信に失敗|Email delivery failed/)).toBeTruthy();
  });
});
