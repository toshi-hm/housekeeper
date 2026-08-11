import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { OpenedAlertBadge } from "./OpenedAlertBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

describe("OpenedAlertBadge", () => {
  it("renders nothing when not opened", () => {
    const { container } = render(<OpenedAlertBadge openedAt={null} thresholdDays={7} />, {
      wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no threshold is configured", () => {
    const { container } = render(<OpenedAlertBadge openedAt={daysAgo(30)} thresholdDays={null} />, {
      wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when opened but not yet past the threshold", () => {
    const { container } = render(<OpenedAlertBadge openedAt={daysAgo(2)} thresholdDays={7} />, {
      wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  it("renders a badge once the threshold has elapsed", () => {
    const { container, getByText } = render(
      <OpenedAlertBadge openedAt={daysAgo(10)} thresholdDays={7} />,
      { wrapper },
    );
    expect(container.firstChild).not.toBeNull();
    expect(getByText(/10/)).toBeTruthy();
  });

  it("renders a badge exactly on the threshold day", () => {
    const { container } = render(<OpenedAlertBadge openedAt={daysAgo(7)} thresholdDays={7} />, {
      wrapper,
    });
    expect(container.firstChild).not.toBeNull();
  });
});
