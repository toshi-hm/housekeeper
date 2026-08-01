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
  let testNotificationSpy: ReturnType<typeof spyOn>;
  const mutateAsync = mock(() => Promise.resolve());
  const testNotificationMutate = mock(() => {});

  const setPrefs = (
    overrides: Partial<{
      push_enabled: boolean;
      email_enabled: boolean;
      email_address: string | null;
      notify_at: string;
    }> = {},
  ) => {
    prefsSpy.mockReturnValue({
      data: {
        user_id: "user-1",
        push_enabled: false,
        email_enabled: false,
        email_address: null,
        threshold_days: 3,
        notify_at: "08:00",
        ...overrides,
      },
    } as unknown as ReturnType<typeof useNotificationPreferencesModule.useNotificationPreferences>);
  };

  beforeEach(() => {
    toastMock.mockClear();
    mutateAsync.mockClear();
    testNotificationMutate.mockClear();

    prefsSpy = spyOn(useNotificationPreferencesModule, "useNotificationPreferences");
    setPrefs();

    updateSpy = spyOn(
      useNotificationPreferencesModule,
      "useUpdateNotificationPreferences",
    ).mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<
      typeof useNotificationPreferencesModule.useUpdateNotificationPreferences
    >);

    testNotificationSpy = spyOn(
      useNotificationPreferencesModule,
      "useTestNotification",
    ).mockReturnValue({
      mutate: testNotificationMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useNotificationPreferencesModule.useTestNotification>);
  });

  afterEach(() => {
    prefsSpy.mockRestore();
    updateSpy.mockRestore();
    testNotificationSpy.mockRestore();
  });

  it("プッシュ通知が無効な場合はテスト送信ボタンが表示されない", () => {
    setPrefs({ push_enabled: false });
    const { queryByText } = render(<NotificationSettings />, { wrapper });
    expect(queryByText(/テスト通知を送信|Send test notification/i)).toBeNull();
  });

  it("プッシュ通知が有効な場合はテスト送信ボタンが表示され、押下すると送信される", () => {
    setPrefs({ push_enabled: true });
    const { getByText } = render(<NotificationSettings />, { wrapper });
    const testButton = getByText(/テスト通知を送信|Send test notification/i);
    fireEvent.click(testButton);
    expect(testNotificationMutate).toHaveBeenCalledTimes(1);
  });

  it("テスト送信中はボタンが無効化される", () => {
    setPrefs({ push_enabled: true });
    testNotificationSpy.mockReturnValue({
      mutate: testNotificationMutate,
      isPending: true,
    } as unknown as ReturnType<typeof useNotificationPreferencesModule.useTestNotification>);
    const { getByText } = render(<NotificationSettings />, { wrapper });
    const testButton = getByText(/テスト通知を送信|Send test notification/i).closest("button");
    expect((testButton as HTMLButtonElement).disabled).toBe(true);
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

  it("通知時刻の入力欄は分単位を選べないstep=3600で表示される (#708)", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const notifyAtInput = getByLabelText(/通知時刻|Notification time/i) as HTMLInputElement;
    expect(notifyAtInput.step).toBe("3600");
  });

  it("通知時刻に分単位の値を入力してフォーカスアウトするとHH:00に丸めて保存される (#708)", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const notifyAtInput = getByLabelText(/通知時刻|Notification time/i);
    fireEvent.blur(notifyAtInput, { target: { value: "08:37" } });

    expect(toastMock).not.toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledWith({ notify_at: "08:00" });
  });

  it("既に分単位で保存されていた値も表示上はHH:00に丸められる (#708)", () => {
    setPrefs({ notify_at: "09:45" });
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const notifyAtInput = getByLabelText(/通知時刻|Notification time/i) as HTMLInputElement;
    expect(notifyAtInput.value).toBe("09:00");
  });

  it("通知時刻に不正な値を入力してフォーカスアウトするとエラートーストを表示し保存しない (#708)", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const notifyAtInput = getByLabelText(/通知時刻|Notification time/i);
    fireEvent.blur(notifyAtInput, { target: { value: "not-a-time" } });

    expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("メール通知が有効でもアドレス未設定の場合は永続的な警告が表示される (#572)", () => {
    setPrefs({ email_enabled: true, email_address: null });
    const { getByText } = render(<NotificationSettings />, { wrapper });
    expect(getByText(/メールアドレスが未設定のため|No email address set/i)).toBeTruthy();
  });

  it("メール通知が有効でアドレス設定済みの場合は警告が表示されない (#572)", () => {
    setPrefs({ email_enabled: true, email_address: "user@example.com" });
    const { queryByText } = render(<NotificationSettings />, { wrapper });
    expect(queryByText(/メールアドレスが未設定のため|No email address set/i)).toBeNull();
  });

  it("タイムゾーンを選択すると保存される (#660)", () => {
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const timezoneSelect = getByLabelText(/タイムゾーン|Timezone/i);
    fireEvent.change(timezoneSelect, { target: { value: "America/Los_Angeles" } });

    expect(mutateAsync).toHaveBeenCalledWith({ timezone: "America/Los_Angeles" });
  });

  it("既定では設定済みのtimezoneが選択された状態で表示される (#660)", () => {
    prefsSpy.mockReturnValue({
      data: {
        user_id: "user-1",
        push_enabled: false,
        email_enabled: false,
        email_address: null,
        threshold_days: 3,
        notify_at: "08:00",
        timezone: "America/Los_Angeles",
      },
    } as unknown as ReturnType<typeof useNotificationPreferencesModule.useNotificationPreferences>);
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const timezoneSelect = getByLabelText(/タイムゾーン|Timezone/i) as HTMLSelectElement;
    expect(timezoneSelect.value).toBe("America/Los_Angeles");
  });
});
