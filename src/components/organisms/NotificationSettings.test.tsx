import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useNotificationPreferencesModule from "@/hooks/useNotificationPreferences";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { NotificationSettings } from "./NotificationSettings";

const toastMock = mock<(message: string, variant?: "success" | "error") => void>(() => {});

const wrapper = ({ children }: { children: ReactNode }) => {
  const stubToast: ToastContextValue = { toasts: [], toast: toastMock, dismiss: () => {} };
  return (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
    </I18nextProvider>
  );
};

describe("NotificationSettings", () => {
  let prefsSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  const mutateAsync = mock(() => Promise.resolve());

  beforeEach(() => {
    toastMock.mockClear();
    mutateAsync.mockClear();

    prefsSpy = spyOn(
      useNotificationPreferencesModule,
      "useNotificationPreferences",
    ).mockReturnValue({
      data: {
        user_id: "user-1",
        push_enabled: false,
        email_enabled: false,
        email_address: null,
        threshold_days: 3,
        notify_at: "08:00",
      },
    } as unknown as ReturnType<typeof useNotificationPreferencesModule.useNotificationPreferences>);

    updateSpy = spyOn(
      useNotificationPreferencesModule,
      "useUpdateNotificationPreferences",
    ).mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<
      typeof useNotificationPreferencesModule.useUpdateNotificationPreferences
    >);
  });

  afterEach(() => {
    prefsSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("通知日数に31以上を入力してフォーカスアウトするとエラートーストを表示し保存しない (#455)", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const thresholdInput = getByLabelText(/日数前|Days before/i);
    fireEvent.blur(thresholdInput, { target: { value: "31" } });

    expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/0.*30|30.*0/), "error");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("通知日数に負数を入力してフォーカスアウトするとエラートーストを表示し保存しない", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const thresholdInput = getByLabelText(/日数前|Days before/i);
    fireEvent.blur(thresholdInput, { target: { value: "-1" } });

    expect(toastMock).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("通知日数に有効な値を入力してフォーカスアウトすると保存されエラートーストは出ない", async () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const thresholdInput = getByLabelText(/日数前|Days before/i);
    fireEvent.blur(thresholdInput, { target: { value: "5" } });

    expect(toastMock).not.toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledWith({ threshold_days: 5 });
  });

  it("通知時刻を空にしてフォーカスアウトするとエラートーストを表示し保存しない (#455)", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const notifyAtInput = getByLabelText(/通知時刻|Notification time/i);
    fireEvent.blur(notifyAtInput, { target: { value: "" } });

    expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
