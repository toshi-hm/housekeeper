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
      display_name: null,
      role: "owner",
      joined_at: "2026-10-01T00:00:00.000Z",
    },
    {
      household_id: "household-1",
      user_id: "member-1",
      display_name: null,
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
  let renameSpy: ReturnType<typeof spyOn>;
  let removeSpy: ReturnType<typeof spyOn>;
  let renamedTo: string | null;
  let removedMemberId: string | null;
  let displayNameSpy: ReturnType<typeof spyOn>;
  let savedDisplayName: string | null;

  beforeEach(async () => {
    savedDisplayName = null;
    displayNameSpy = spyOn(HouseholdHooks, "useSetMemberDisplayName").mockReturnValue({
      mutateAsync: mock(async (name: string) => {
        savedDisplayName = name;
      }),
      isPending: false,
    } as unknown as ReturnType<typeof HouseholdHooks.useSetMemberDisplayName>);
    await i18n.changeLanguage("en");
    createInviteCalled = false;
    redeemedCode = null;
    renamedTo = null;
    removedMemberId = null;
    renameSpy = spyOn(HouseholdHooks, "useRenameHousehold").mockReturnValue({
      mutateAsync: mock(async (name: string) => {
        renamedTo = name;
      }),
      isPending: false,
    } as unknown as ReturnType<typeof HouseholdHooks.useRenameHousehold>);
    removeSpy = spyOn(HouseholdHooks, "useRemoveHouseholdMember").mockReturnValue({
      mutateAsync: mock(async (userId: string) => {
        removedMemberId = userId;
      }),
      isPending: false,
    } as unknown as ReturnType<typeof HouseholdHooks.useRemoveHouseholdMember>);
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
    renameSpy.mockRestore();
    removeSpy.mockRestore();
    displayNameSpy.mockRestore();
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

  it("hides rename and remove controls from non-owner members", () => {
    const { queryByLabelText, queryByRole } = render(<HouseholdSettingsPage />, {
      wrapper: Wrapper,
    });

    expect(queryByLabelText("Household name")).toBeNull();
    expect(queryByRole("button", { name: "Rename" })).toBeNull();
    expect(queryByRole("button", { name: /^Remove member/ })).toBeNull();
  });

  it("saves the entered display name for the current member", async () => {
    const { getByLabelText, getByRole } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });
    const user = userEvent.setup();
    const saveButton = getByRole("button", { name: "Save" });
    expect(saveButton.hasAttribute("disabled")).toBe(true);

    await user.type(getByLabelText("Your display name"), "Hanako");
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);

    await waitFor(() => expect(savedDisplayName).toBe("Hanako"));
  });

  it("shows display names in the member list instead of the truncated id", () => {
    householdSpy.mockReturnValue({
      data: {
        ...householdData,
        members: [
          { ...householdData.members[0], display_name: "Taro" },
          { ...householdData.members[1], display_name: "Hanako" },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof HouseholdHooks.useHousehold>);

    const { getByText, queryByText } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });

    expect(getByText("Taro")).toBeDefined();
    expect(getByText("Hanako (You)")).toBeDefined();
    expect(queryByText("owner-1…")).toBeNull();
  });

  describe("as the owner", () => {
    beforeEach(() => {
      householdSpy.mockReturnValue({
        data: { ...householdData, currentUserId: "owner-1" },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof HouseholdHooks.useHousehold>);
    });

    it("renames the household with the entered name", async () => {
      const { getByLabelText, getByRole } = render(<HouseholdSettingsPage />, {
        wrapper: Wrapper,
      });
      const user = userEvent.setup();
      const renameButton = getByRole("button", { name: "Rename" });
      expect(renameButton.hasAttribute("disabled")).toBe(true);

      const input = getByLabelText("Household name");
      await user.clear(input);
      await user.type(input, "Our Home");
      await waitFor(() => expect(renameButton.hasAttribute("disabled")).toBe(false));
      fireEvent.click(renameButton);

      await waitFor(() => expect(renamedTo).toBe("Our Home"));
    });

    it("offers removal only for other members and asks for confirmation", async () => {
      const { getAllByRole, getByRole, queryByRole } = render(<HouseholdSettingsPage />, {
        wrapper: Wrapper,
      });

      // The owner's own row has no remove button; only member-1 does.
      expect(getAllByRole("button", { name: /^Remove member/ })).toHaveLength(1);
      expect(queryByRole("alertdialog")).toBeNull();

      fireEvent.click(getByRole("button", { name: /^Remove member/ }));
      expect(getByRole("alertdialog")).toBeDefined();
      expect(removedMemberId).toBeNull();

      fireEvent.click(getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(removedMemberId).toBe("member-1"));
      await waitFor(() => expect(queryByRole("alertdialog")).toBeNull());
    });

    it("includes the display name in the removal confirmation and aria label", () => {
      householdSpy.mockReturnValue({
        data: {
          ...householdData,
          currentUserId: "owner-1",
          members: [
            householdData.members[0],
            { ...householdData.members[1], display_name: "Hanako" },
          ],
        },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof HouseholdHooks.useHousehold>);
      const { getByRole, getByText } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });

      fireEvent.click(getByRole("button", { name: "Remove member Hanako from the household" }));

      expect(getByText(/^Hanako: /)).toBeDefined();
    });

    it("does not remove anyone when the confirmation is cancelled", async () => {
      const { getByRole, queryByRole } = render(<HouseholdSettingsPage />, { wrapper: Wrapper });

      fireEvent.click(getByRole("button", { name: /^Remove member/ }));
      fireEvent.click(getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(queryByRole("alertdialog")).toBeNull());
      expect(removedMemberId).toBeNull();
    });
  });
});
