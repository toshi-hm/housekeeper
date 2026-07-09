import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useCalendarConsumeModule from "@/hooks/useCalendarConsume";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { Route } from "./_auth.calendar";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
  </I18nextProvider>
);

describe("CalendarRoutePage", () => {
  const spies: Array<{ mockRestore: () => void }> = [];

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
    spies.length = 0;
  });

  it("フックのデータを CalendarPage に渡して描画する", () => {
    spies.push(
      spyOn(useItemsModule, "useItemsWithExpiry").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useItemsModule.useItemsWithExpiry>),
      spyOn(useMasterDataModule, "useCategories").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useMasterDataModule.useCategories>),
      spyOn(useCalendarConsumeModule, "useCalendarConsume").mockReturnValue({
        check: () => Promise.resolve(),
        undo: () => Promise.resolve(),
        pendingRemovalList: [],
      } as unknown as ReturnType<typeof useCalendarConsumeModule.useCalendarConsume>),
    );

    const Component = Route.options.component as React.ComponentType;
    const { container } = render(<Component />, { wrapper });

    // 空状態 (アイテムなし) のカレンダーページが描画される
    expect(container.querySelector("svg.lucide-calendar-days")).not.toBeNull();
  });
});
