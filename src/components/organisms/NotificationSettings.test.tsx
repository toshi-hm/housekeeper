import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";

import * as useNotifModule from "@/hooks/useNotificationPreferences";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { NotificationPreferences } from "@/types/user";

import { NotificationSettings } from "./NotificationSettings";

const basePrefs: NotificationPreferences = {
  user_id: "u1",
  push_enabled: false,
  email_enabled: false,
  email_address: null,
  threshold_days: 3,
  notify_at: "08:00",
};

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

describe("NotificationSettings - threshold_days validation", () => {
  let notifSpy: ReturnType<typeof spyOn>;
  let updateNotifSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    notifSpy = spyOn(useNotifModule, "useNotificationPreferences").mockReturnValue({
      data: basePrefs,
      isLoading: false,
    } as ReturnType<typeof useNotifModule.useNotificationPreferences>);

    updateNotifSpy = spyOn(useNotifModule, "useUpdateNotificationPreferences").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
  });

  afterEach(() => {
    notifSpy.mockRestore();
    updateNotifSpy.mockRestore();
    cleanup();
  });

  it("does not call updatePrefs when threshold_days is above 30", async () => {
    const mutateAsync = mock(async () => {});
    updateNotifSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
    const { stub } = makeToastStub();
    const { getByRole } = render(<NotificationSettings />, { wrapper: Wrapper(stub) });

    const input = getByRole("spinbutton");
    fireEvent.blur(input, { target: { value: "31" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does not call updatePrefs when threshold_days is negative", async () => {
    const mutateAsync = mock(async () => {});
    updateNotifSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
    const { stub } = makeToastStub();
    const { getByRole } = render(<NotificationSettings />, { wrapper: Wrapper(stub) });

    const input = getByRole("spinbutton");
    fireEvent.blur(input, { target: { value: "-1" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does not call updatePrefs when threshold_days is NaN", async () => {
    const mutateAsync = mock(async () => {});
    updateNotifSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
    const { stub } = makeToastStub();
    const { getByRole } = render(<NotificationSettings />, { wrapper: Wrapper(stub) });

    const input = getByRole("spinbutton");
    fireEvent.blur(input, { target: { value: "abc" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("calls updatePrefs when threshold_days is valid (e.g. 7)", async () => {
    const mutateAsync = mock(async () => {});
    updateNotifSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
    const { stub } = makeToastStub();
    const { getByRole } = render(<NotificationSettings />, { wrapper: Wrapper(stub) });

    const input = getByRole("spinbutton");
    fireEvent.blur(input, { target: { value: "7" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).toHaveBeenCalledWith({ threshold_days: 7 });
  });

  it("calls updatePrefs when threshold_days is exactly 30", async () => {
    const mutateAsync = mock(async () => {});
    updateNotifSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
    const { stub } = makeToastStub();
    const { getByRole } = render(<NotificationSettings />, { wrapper: Wrapper(stub) });

    const input = getByRole("spinbutton");
    fireEvent.blur(input, { target: { value: "30" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).toHaveBeenCalledWith({ threshold_days: 30 });
  });

  it("calls updatePrefs when threshold_days is exactly 0", async () => {
    const mutateAsync = mock(async () => {});
    updateNotifSpy.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useNotifModule.useUpdateNotificationPreferences>);
    const { stub } = makeToastStub();
    const { getByRole } = render(<NotificationSettings />, { wrapper: Wrapper(stub) });

    const input = getByRole("spinbutton");
    fireEvent.blur(input, { target: { value: "0" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(mutateAsync).toHaveBeenCalledWith({ threshold_days: 0 });
  });
});
