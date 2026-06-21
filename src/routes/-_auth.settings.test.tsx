import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";

import * as useNotifModule from "@/hooks/useNotificationPreferences";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Mock react-i18next so t(key) returns the key (no i18next instance needed)
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock TanStack Router hooks/components that have complex router dependencies
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
  Outlet: () => null,
  useNavigate: () => () => Promise.resolve(),
  useRouterState: ({ select }: { select?: (s: { matches: unknown[] }) => unknown } = {}) => {
    const state = { matches: [] as unknown[] };
    return select ? select(state) : state;
  },
}));

// Import after mocking
const { SettingsPage } = await import("./_auth.settings");

const makeToastStub = () => {
  const toastFn = mock(() => {});
  const stub: ToastContextValue = { toasts: [], toast: toastFn, dismiss: () => {} };
  return { stub, toastFn };
};

const Wrapper =
  (toastStub: ToastContextValue) =>
  ({ children }: { children: React.ReactNode }) => (
    <ToastContext.Provider value={toastStub}>{children}</ToastContext.Provider>
  );

describe("SettingsPage - expiryWarningDays validation", () => {
  let settingsSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let notifSpy: ReturnType<typeof spyOn>;
  let updateNotifSpy: ReturnType<typeof spyOn>;

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

    expect(toastFn).toHaveBeenCalledWith("invalidWarningDays", "error");
  });

  it("shows error toast when value is 0 (below minimum)", () => {
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "0" } });

    expect(toastFn).toHaveBeenCalledWith("invalidWarningDays", "error");
  });

  it("shows error toast when value is not a number", () => {
    const { stub, toastFn } = makeToastStub();
    const { getAllByRole } = render(<SettingsPage />, { wrapper: Wrapper(stub) });

    const input = getAllByRole("spinbutton")[0]!;
    fireEvent.blur(input, { target: { value: "abc" } });

    expect(toastFn).toHaveBeenCalledWith("invalidWarningDays", "error");
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
    expect(toastFn).toHaveBeenCalledWith("saveSuccess", "success");
  });
});
