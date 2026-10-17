import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ItemLoadError } from "./ItemLoadError";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ItemLoadError (#1243)", () => {
  afterEach(cleanup);

  it("エラーを alert として表示し「見つかりません」とは表示しない", () => {
    const { getByRole, queryByText } = render(
      <ItemLoadError onRetry={() => {}} onBack={() => {}} />,
      { wrapper },
    );
    expect(getByRole("alert").textContent).toContain(i18n.t("items:itemLoadError"));
    expect(queryByText(i18n.t("items:itemNotFound"))).toBeNull();
  });

  it("再試行ボタンで onRetry、戻るボタンで onBack を呼ぶ", () => {
    const onRetry = mock(() => undefined);
    const onBack = mock(() => undefined);
    const { getByRole } = render(<ItemLoadError onRetry={onRetry} onBack={onBack} />, {
      wrapper,
    });
    fireEvent.click(getByRole("button", { name: i18n.t("common:retry") }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("button", { name: i18n.t("common:back") }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
