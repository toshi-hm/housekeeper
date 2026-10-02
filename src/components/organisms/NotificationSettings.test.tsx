import { fireEvent, render, waitFor } from "@testing-library/react";
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
      waste_digest_enabled: boolean;
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
        waste_digest_enabled: false,
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

  it("プッシュ・メールともに無効な場合はテスト送信ボタンが表示されない", () => {
    setPrefs({ push_enabled: false, email_enabled: false });
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

  it("メール通知のみ有効な場合もテスト送信ボタンが表示され、押下すると送信される (#1063)", () => {
    setPrefs({ push_enabled: false, email_enabled: true, email_address: "user@example.com" });
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

  it("通知日数に不正な値を入力してフォーカスアウトすると表示値が保存済みの値に戻りaria-invalidになる (#918)", () => {
    setPrefs({});
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const thresholdInput = getByLabelText(/日数前|Days before/i) as HTMLInputElement;
    fireEvent.change(thresholdInput, { target: { value: "31" } });
    fireEvent.blur(thresholdInput);

    expect(thresholdInput.value).toBe("3");
    expect(thresholdInput.getAttribute("aria-invalid")).toBe("true");
    expect(thresholdInput.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("通知時刻に不正な値を入力してフォーカスアウトすると表示値が保存済みの値に戻りaria-invalidになる (#918)", () => {
    setPrefs({ notify_at: "09:00" });
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const notifyAtInput = getByLabelText(/通知時刻|Notification time/i) as HTMLInputElement;
    fireEvent.change(notifyAtInput, { target: { value: "" } });
    fireEvent.blur(notifyAtInput);

    expect(notifyAtInput.value).toBe("09:00");
    expect(notifyAtInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("メールアドレスに不正な値を入力してフォーカスアウトすると表示値が保存済みの値に戻りaria-invalidになる (#918)", () => {
    setPrefs({ email_enabled: true, email_address: "user@example.com" });
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const emailInput = getByLabelText(/メールアドレス|Email address/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.blur(emailInput);

    expect(emailInput.value).toBe("user@example.com");
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("バリデーションエラー後に有効な値で再度フォーカスアウトするとaria-invalidが解除される (#918)", () => {
    setPrefs({});
    const { getByLabelText } = render(<NotificationSettings />, { wrapper });
    const thresholdInput = getByLabelText(/日数前|Days before/i) as HTMLInputElement;
    fireEvent.change(thresholdInput, { target: { value: "31" } });
    fireEvent.blur(thresholdInput);
    expect(thresholdInput.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(thresholdInput, { target: { value: "5" } });
    fireEvent.blur(thresholdInput);
    expect(thresholdInput.getAttribute("aria-invalid")).toBe("false");
    expect(mutateAsync).toHaveBeenCalledWith({ threshold_days: 5 });
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

  // --- 週次ダイジェスト受信トグル (#925) ---

  it("初期状態では週次ダイジェストのトグルは無効表示になる", () => {
    setPrefs({ waste_digest_enabled: false });
    const { getByText } = render(<NotificationSettings />, { wrapper });
    const toggle = getByText(/週次ダイジェストを受け取る|Receive weekly digest/i)
      .closest("div")
      ?.parentElement?.querySelector("button");
    expect(toggle?.textContent).toMatch(/無効|Disabled/i);
  });

  it("週次ダイジェストのトグルを押すと有効化され保存される", () => {
    setPrefs({ waste_digest_enabled: false });
    const { getByText } = render(<NotificationSettings />, { wrapper });
    const toggle = getByText(/週次ダイジェストを受け取る|Receive weekly digest/i)
      .closest("div")
      ?.parentElement?.querySelector("button") as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(mutateAsync).toHaveBeenCalledWith({ waste_digest_enabled: true });
  });

  it("有効な場合はトグルを押すと無効化され保存される", () => {
    setPrefs({ waste_digest_enabled: true });
    const { getByText } = render(<NotificationSettings />, { wrapper });
    const toggle = getByText(/週次ダイジェストを受け取る|Receive weekly digest/i)
      .closest("div")
      ?.parentElement?.querySelector("button") as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(mutateAsync).toHaveBeenCalledWith({ waste_digest_enabled: false });
  });

  // --- Push購読とpush_enabledの不整合ロールバック (#1081) ---
  describe("プッシュ通知トグルの2段階更新", () => {
    const originalNotification = (window as unknown as { Notification?: unknown }).Notification;
    const originalServiceWorker = navigator.serviceWorker;
    const originalPushManager = (window as unknown as { PushManager?: unknown }).PushManager;
    const requestPermission = mock(() => Promise.resolve("granted"));

    const findPushToggle = (container: HTMLElement): HTMLButtonElement => {
      const label = Array.from(container.querySelectorAll("span")).find((el) =>
        /プッシュ通知|Push Notifications/i.test(el.textContent ?? ""),
      );
      const button = label?.closest("div")?.parentElement?.querySelector("button");
      if (!button) throw new Error("push toggle button not found");
      return button as HTMLButtonElement;
    };

    const enablePushSupport = () => {
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: { requestPermission },
      });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { ready: Promise.resolve({}) },
      });
      Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    };

    beforeEach(() => {
      requestPermission.mockClear();
      enablePushSupport();
    });

    afterEach(() => {
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: originalNotification,
      });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalServiceWorker,
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: originalPushManager,
      });
    });

    it("有効化時に購読は成功しDB更新が失敗した場合、購読をロールバック（解除）する", async () => {
      setPrefs({ push_enabled: false });
      const subscribeSpy = spyOn(
        useNotificationPreferencesModule,
        "subscribePush",
      ).mockResolvedValue(undefined);
      const unsubscribeSpy = spyOn(
        useNotificationPreferencesModule,
        "unsubscribePush",
      ).mockResolvedValue(undefined);
      mutateAsync.mockImplementationOnce(() => Promise.reject(new Error("network error")));

      const { container } = render(<NotificationSettings />, { wrapper });
      fireEvent.click(findPushToggle(container));

      await waitFor(() => expect(unsubscribeSpy).toHaveBeenCalledTimes(1));
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error");
      expect(toastMock).not.toHaveBeenCalledWith(
        expect.stringMatching(/プッシュ通知|Push/i),
        "success",
      );

      subscribeSpy.mockRestore();
      unsubscribeSpy.mockRestore();
    });

    it("無効化時に購読解除は成功しDB更新が失敗した場合、購読をロールバック（再購読）する", async () => {
      setPrefs({ push_enabled: true });
      const subscribeSpy = spyOn(
        useNotificationPreferencesModule,
        "subscribePush",
      ).mockResolvedValue(undefined);
      const unsubscribeSpy = spyOn(
        useNotificationPreferencesModule,
        "unsubscribePush",
      ).mockResolvedValue(undefined);
      mutateAsync.mockImplementationOnce(() => Promise.reject(new Error("network error")));

      const { container } = render(<NotificationSettings />, { wrapper });
      fireEvent.click(findPushToggle(container));

      await waitFor(() => expect(subscribeSpy).toHaveBeenCalledTimes(1));
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error");

      subscribeSpy.mockRestore();
      unsubscribeSpy.mockRestore();
    });

    it("有効化に成功した場合はロールバックが起きず成功トーストのみ表示される", async () => {
      setPrefs({ push_enabled: false });
      const subscribeSpy = spyOn(
        useNotificationPreferencesModule,
        "subscribePush",
      ).mockResolvedValue(undefined);
      const unsubscribeSpy = spyOn(
        useNotificationPreferencesModule,
        "unsubscribePush",
      ).mockResolvedValue(undefined);
      mutateAsync.mockImplementationOnce(() => Promise.resolve());

      const { container } = render(<NotificationSettings />, { wrapper });
      fireEvent.click(findPushToggle(container));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ push_enabled: true }));
      expect(unsubscribeSpy).not.toHaveBeenCalled();

      subscribeSpy.mockRestore();
      unsubscribeSpy.mockRestore();
    });
  });
});
