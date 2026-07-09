import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";
import { I18nextProvider } from "react-i18next";

import * as useNotifModule from "@/hooks/useNotificationPreferences";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Import routerContext via internal path (not public export) to provide a
// minimal router stub so that useRouterState / useNavigate / Link don't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { SettingsPage } from "./_auth.settings";

const routerState = {
  status: "idle" as const,
  isFetching: false,
  matches: [] as unknown[],
  pendingMatches: [] as unknown[],
  cachedMatches: [] as unknown[],
  location: { href: "/", pathname: "/", search: {}, searchStr: "", hash: "", state: {} },
  resolvedLocation: { href: "/", pathname: "/", search: {}, searchStr: "", hash: "", state: {} },
};

const stubLocation = { href: "/", pathname: "/", search: {}, searchStr: "", hash: "", state: {} };

const makeStubStore = <T,>(value: T) => ({
  get: () => value,
  subscribe: () => ({ unsubscribe: () => {} }),
});

const navigateMock = mock(() => Promise.resolve());

const stubRouter = {
  navigate: navigateMock,
  buildLocation: () => ({
    href: "/",
    pathname: "/",
    search: {},
    searchStr: "",
    hash: "",
    state: {},
    publicHref: "/",
    external: false,
    maskedLocation: undefined,
  }),
  isServer: false,
  basepath: "/",
  options: { defaultStructuralSharing: false, defaultPreload: false },
  protocolAllowlist: ["https", "http"],
  state: routerState,
  stores: {
    __store: makeStubStore(routerState),
    location: makeStubStore(stubLocation),
  },
  history: { createHref: (href: string) => href },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const makeToastStub = () => {
  const toastFn = mock(() => {});
  const stub: ToastContextValue = { toasts: [], toast: toastFn, dismiss: () => {} };
  return { stub, toastFn };
};

const Wrapper =
  (toastStub: ToastContextValue) =>
  ({ children }: { children: React.ReactNode }) => (
    <routerContext.Provider value={stubRouter}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={toastStub}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </routerContext.Provider>
  );

describe("SettingsPage (言語変更・ローディング・エラー)", () => {
  let settingsSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let notifSpy: ReturnType<typeof spyOn>;
  let updateNotifSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    await i18n.changeLanguage("ja");
  });

  beforeEach(() => {
    navigateMock.mockClear();
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: { expiry_warning_days: 3, language: "ja" },
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    updateSpy = spyOn(useUserSettingsModule, "useUpdateUserSettings").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);

    notifSpy = spyOn(useNotifModule, "useNotificationPreferences").mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof useNotifModule.useNotificationPreferences>);

    updateNotifSpy = spyOn(useNotifModule, "useUpdateNotificationPreferences").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
  });

  afterEach(() => {
    settingsSpy.mockRestore();
    updateSpy.mockRestore();
    notifSpy.mockRestore();
    updateNotifSpy.mockRestore();
    cleanup();
  });

  it("ローディング中はスケルトンを表示する", () => {
    settingsSpy.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const { stub } = makeToastStub();
    const { container, queryAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(queryAllByRole("combobox")).toHaveLength(0);
  });

  it("言語変更で updateSettings が呼ばれ success トーストを出す", async () => {
    const mutateAsync = mock(async () => {});
    updateSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);

    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const languageSelect = getAllByRole("combobox")[0]!;
    fireEvent.change(languageSelect, { target: { value: "en" } });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ language: "en" }));
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith("設定を保存しました", "success"));
  });

  it("言語変更に失敗すると unknownError トーストを出す", async () => {
    const mutateAsync = mock(async () => {
      throw new Error("update failed");
    });
    updateSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);

    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    fireEvent.change(getAllByRole("combobox")[0]!, { target: { value: "en" } });

    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(i18n.t("common:unknownError"), "error"),
    );
  });

  it("警告日数の更新に失敗すると unknownError トーストを出す", async () => {
    const mutateAsync = mock(async () => {
      throw new Error("update failed");
    });
    updateSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);

    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "7" } });

    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(i18n.t("common:unknownError"), "error"),
    );
  });

  it("戻るボタンで navigate が呼ばれる", () => {
    const { stub } = makeToastStub();
    const { container } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const backButton = container.querySelector("svg.lucide-arrow-left")?.closest("button");
    fireEvent.click(backButton!);

    expect(navigateMock).toHaveBeenCalled();
  });
});
