import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

// Minimal router state — matches=[] ensures isChildActive is false.
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

// useStore (used by useRouterState + Link) needs atom.get() + atom.subscribe()
const stubRouter = {
  navigate: () => Promise.resolve(),
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

const Wrapper = (toastStub: ToastContextValue) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <routerContext.Provider value={stubRouter}>
        <I18nextProvider i18n={i18n}>
          <ToastContext.Provider value={toastStub}>{children}</ToastContext.Provider>
        </I18nextProvider>
      </routerContext.Provider>
    </QueryClientProvider>
  );
};

describe("SettingsPage - expiryWarningDays validation", () => {
  let settingsSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let notifSpy: ReturnType<typeof spyOn>;
  let updateNotifSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    await i18n.changeLanguage("ja");
  });

  beforeEach(() => {
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

  it("shows error toast when value is above 30", () => {
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "31" } });

    expect(toastFn).toHaveBeenCalledWith("警告日数は1〜30日の範囲で入力してください", "error");
  });

  it("shows error toast when value is 0 (below minimum)", () => {
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "0" } });

    expect(toastFn).toHaveBeenCalledWith("警告日数は1〜30日の範囲で入力してください", "error");
  });

  it("shows error toast when value is not a number", () => {
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "abc" } });

    expect(toastFn).toHaveBeenCalledWith("警告日数は1〜30日の範囲で入力してください", "error");
  });

  it("does not call updateSettings for invalid value above 30", async () => {
    const mutateAsync = mock(async () => {});
    updateSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);
    const { stub } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "99" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("calls updateSettings with valid value and shows success toast", async () => {
    const mutateAsync = mock(async () => {});
    updateSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "7" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).toHaveBeenCalledWith({ expiry_warning_days: 7 });
    expect(toastFn).toHaveBeenCalledWith("設定を保存しました", "success");
  });
});

describe("SettingsPage - default unit", () => {
  let settingsSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let notifSpy: ReturnType<typeof spyOn>;
  let updateNotifSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    await i18n.changeLanguage("ja");
  });

  beforeEach(() => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: { expiry_warning_days: 3, language: "ja", default_unit: "本" },
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

  const findDefaultUnitSelect = (comboboxes: HTMLElement[]) =>
    comboboxes.find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === "kg"),
    ) as HTMLSelectElement;

  it("shows the current default unit as selected", () => {
    const { stub } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const select = findDefaultUnitSelect(getAllByRole("combobox"));
    expect(select.value).toBe("本");
  });

  it("saves the newly selected default unit", async () => {
    const mutateAsync = mock(async () => {});
    updateSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUpdateUserSettings>);
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const select = findDefaultUnitSelect(getAllByRole("combobox"));
    fireEvent.change(select, { target: { value: "kg" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).toHaveBeenCalledWith({ default_unit: "kg" });
    expect(toastFn).toHaveBeenCalledWith("設定を保存しました", "success");
  });
});
