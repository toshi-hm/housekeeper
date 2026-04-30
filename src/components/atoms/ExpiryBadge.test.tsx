import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ExpiryBadge } from "./ExpiryBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ExpiryBadge", () => {
  it("renders nothing for null expiry date", () => {
    const { container } = render(<ExpiryBadge expiryDate={null} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined expiry date", () => {
    const { container } = render(<ExpiryBadge expiryDate={undefined} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders badge for past (expired) date", () => {
    const { container } = render(<ExpiryBadge expiryDate="2020-01-01" />, { wrapper });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders badge for date within warning window", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 1);
    const { container } = render(
      <ExpiryBadge expiryDate={soon.toISOString().slice(0, 10)} warningDays={3} />,
      { wrapper },
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("renders badge for date well in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const { container } = render(
      <ExpiryBadge expiryDate={future.toISOString().slice(0, 10)} warningDays={3} />,
      { wrapper },
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("renders differently for warningDays=3 vs warningDays=7 with 5-day future date", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    const date = soon.toISOString().slice(0, 10);
    const { container: c1 } = render(<ExpiryBadge expiryDate={date} warningDays={3} />, { wrapper });
    const { container: c2 } = render(<ExpiryBadge expiryDate={date} warningDays={7} />, { wrapper });
    expect(c1.innerHTML).not.toEqual(c2.innerHTML);
  });
});
