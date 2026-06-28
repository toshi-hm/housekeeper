import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { Spinner } from "./Spinner";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("Spinner", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("renders with default aria-label from locale", () => {
    const { container } = render(<Spinner />, { wrapper });
    const el = container.firstChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute("role")).toBe("status");
    // ja fallback: "読み込み中..."
    expect(el.getAttribute("aria-label")).toBe("読み込み中...");
  });

  it("renders with custom aria-label override", () => {
    const { container } = render(<Spinner label="カスタムラベル" />, { wrapper });
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-label")).toBe("カスタムラベル");
  });

  it("applies custom className", () => {
    const { container } = render(<Spinner className="h-4 w-4" />, { wrapper });
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4 w-4");
  });
});
