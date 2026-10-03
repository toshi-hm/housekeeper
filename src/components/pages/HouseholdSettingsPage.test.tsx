import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";
import { I18nextProvider } from "react-i18next";

import type { HouseholdDetails } from "@/hooks/useHousehold";
import * as HouseholdHooks from "@/hooks/useHousehold";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { HouseholdSettingsPage } from "./HouseholdSettingsPage";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: {
    location: { href: "/", pathname: "/settings/household" },
    matches: [],
    pendingMatches: [],
  },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const householdData = {
  household: {
    id: "household-1",
    name: "Home",
    created_by: "owner-1",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  },
  members: [
    {
      household_id: "household-1",
      user_id: "owner-1",
      role: "owner",
      joined_at: "2026-10-01T00:00:00.000Z",
    },
    {
      household_id: "household-1",
      user_id: "member-1",
      role: "member",
      joined_at: "2026-10-02T00:00:00.000Z",
    },
  ],
  invites: [],
  currentUserId: "member-1",
} as HouseholdDetails;

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = React.useState(() => new QueryClient());
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <routerContext.Provider value={stubRouter}>
          <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
        </routerContext.Provider>
      </QueryClientProvider>
    </I18nextProvider>
  );
};

describe("HouseholdSettingsPage", () => {
  let householdSpy: ReturnType<typeof spyOn>;
  let createInviteSpy: ReturnType<typeof spyOn>;
  let redeemInviteSpy: ReturnType<typeof spyOn>;
  let createInviteCalled: boolean;
  let redeemedCode: string | null;

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    createInviteCalled = false;
    redeemedCode = null;
    householdSpy = spyOn(HouseholdHooks, "useHousehold").mockReturnValue({
      data: householdData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof HouseholdHooks.useHousehold>);
    createInviteSpy = spyOn(HouseholdHooks, "useCreateHouseholdInvite").mockReturnValue({
      mutateAsync: mock(async () => {
        createInviteCalled = true;
        return { code: "ABCD2345" };
      }),
      isPending: false,
    } as unknown as ReturnType<typeof HouseholdHooks.useCreateHouseholdInvite>);
    redeemInviteSpy = spyOn(HouseholdHooks, "useRedeemHouseholdInvite").mockReturnValue({
      mutateAsync: mock(
        async (input: { code: string; confirmPersonalDataInaccessible: boolean }) => {
          expect(input.confirmPersonalDataInaccessible).toBe(true);
          redeemedCode = input.code;
          return "household-1";
        },
      ),
      isPending: false,
    } as unknown as ReturnType<typeof HouseholdHooks.useRedeemHouseholdInvite>);
  });

  afterEach(() => {
    householdSpy.mockRestore();
    createInviteSpy.mockRestore();
    redeemInviteSpy.mockRestore();
    cleanup();
    void i18n.changeLanguage("ja");
  });

  it("shows members and requires personal-data confirmation before joining", async () => {
    const { getByText, getByRole } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });
    const user = userEvent.setup();

    expect(getByText("Home")).toBeDefined();
    expect(getByText("You")).toBeDefined();
    expect(getByText("Owner")).toBeDefined();
    const joinButton = getByRole("button", { name: "Join household" });
    expect(joinButton.hasAttribute("disabled")).toBe(true);

    await user.type(getByRole("textbox", { name: "Invite code" }), "share123");
    await user.click(getByRole("checkbox"));
    await waitFor(() => expect(joinButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(joinButton);

    await waitFor(() => expect(redeemedCode).toBe("SHARE123"));
  });

  it("creates an invite code for household members", async () => {
    const { getByRole } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });

    fireEvent.click(getByRole("button", { name: "Create invite code" }));

    await waitFor(() => expect(createInviteCalled).toBe(true));
  });

  it("announces a household load failure", () => {
    householdSpy.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof HouseholdHooks.useHousehold>);

    const { getByRole } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });

    expect(getByRole("alert")).toBeDefined();
  });
});
