import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";

import * as useItemsModule from "@/hooks/useItems";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item } from "@/types/item";

// ItemForm pulls in barcode scanning, image upload and master-data hooks that
// are irrelevant to the default-unit wiring under test, so it is replaced with
// a lightweight stub that surfaces the received `defaultValues.content_unit`.
mock.module("@/components/organisms/ItemForm", () => ({
  ItemForm: ({ defaultValues }: { defaultValues?: { content_unit?: string } }) => (
    <div data-testid="content-unit">{defaultValues?.content_unit ?? ""}</div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { NewItemPage } from "./NewItemPage";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const [client] = React.useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <routerContext.Provider value={stubRouter}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </routerContext.Provider>
    </QueryClientProvider>
  );
};

describe("NewItemPage - default content unit", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => ({}) as Item,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    cleanup();
  });

  it("passes the user's default_unit as the initial content unit", () => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: { default_unit: "kg" },
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    expect(getByTestId("content-unit").textContent).toBe("kg");
  });

  it("leaves content unit unset when the user has no default_unit configured", () => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    expect(getByTestId("content-unit").textContent).toBe("");
  });
});
