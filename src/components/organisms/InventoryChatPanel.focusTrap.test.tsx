import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { type ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

// InventoryChatPanel pulls in useInventoryChat, which invokes the
// `inventory-chat` Supabase Edge Function via `@/lib/supabase`. That module
// throws at import time unless Supabase env vars are configured, and it also
// performs real network calls, neither of which are relevant to the focus
// management under test here.
//
// Mocked at the `@/lib/supabase` layer (not `@/hooks/useInventoryChat`)
// deliberately: `mock.module` in bun:test is process-global, not scoped to
// this file, and `InventoryChatPanel.test.tsx` (in the same directory, same
// bun:test process) mocks `@/lib/supabase` to drive the real
// `useInventoryChat` hook end-to-end. Mocking the hook itself here instead
// would replace that real hook for every file in the run, silently breaking
// the other test's assertions depending on load order. None of the tests in
// this file actually send a message, so the mock only needs to exist, not
// resolve anything meaningful.
mock.module("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: () => Promise.resolve({ data: { reply: "", items: [] }, error: null }),
    },
  },
}));

import { InventoryChatPanel } from "./InventoryChatPanel";

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
};

// Standalone trigger button + panel, mirroring how `_auth.tsx` wires the
// AI chat button to `InventoryChatPanel`'s `open`/`onClose` props.
const Harness = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open-trigger
      </button>
      <InventoryChatPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
};

afterEach(cleanup);

describe("InventoryChatPanel - focus management (#556)", () => {
  it("moves initial focus into the composer textarea when opened", async () => {
    const user = userEvent.setup();
    const { getByText, getByLabelText } = render(<Harness />, { wrapper });

    await user.click(getByText("open-trigger"));

    const textarea = getByLabelText(i18n.t("chat:inputLabel"));
    expect(document.activeElement).toBe(textarea);
  });

  it("traps Tab/Shift+Tab focus within the panel", async () => {
    const user = userEvent.setup();
    const { getByText, getByLabelText } = render(<Harness />, { wrapper });

    await user.click(getByText("open-trigger"));

    const textarea = getByLabelText(i18n.t("chat:inputLabel"));
    const closeButton = getByLabelText(i18n.t("chat:close"));

    // Composer textarea receives initial focus, and — since the "clear"
    // button and the send button are both disabled at this point — it is
    // also the last focusable element in the panel.
    expect(document.activeElement).toBe(textarea);

    await user.tab();
    expect(document.activeElement).toBe(closeButton);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(textarea);
  });

  it("restores focus to the trigger button when closed", async () => {
    const user = userEvent.setup();
    const { getByText, getByLabelText } = render(<Harness />, { wrapper });

    const trigger = getByText("open-trigger");
    await user.click(trigger);

    const closeButton = getByLabelText(i18n.t("chat:close"));
    await user.click(closeButton);

    expect(document.activeElement).toBe(trigger);
  });

  it("restores focus to the trigger button when closed via Escape", async () => {
    const user = userEvent.setup();
    const { getByText } = render(<Harness />, { wrapper });

    const trigger = getByText("open-trigger");
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab/Shift+Tab around the full set of focusable elements, not just the first two", async () => {
    const user = userEvent.setup();
    const { getByText, getByLabelText } = render(<Harness />, { wrapper });

    await user.click(getByText("open-trigger"));

    const closeButton = getByLabelText(i18n.t("chat:close"));
    const suggestion1 = getByText(i18n.t("chat:suggestion1"));
    const suggestion2 = getByText(i18n.t("chat:suggestion2"));
    const suggestion3 = getByText(i18n.t("chat:suggestion3"));
    const textarea = getByLabelText(i18n.t("chat:inputLabel"));

    // Focusable order in this empty-conversation state: close button, the
    // three suggestion buttons, then the composer textarea (last, since the
    // send button is disabled while the textarea is empty).
    expect(document.activeElement).toBe(textarea);

    // Shift+Tab walks backward through every middle element naturally (the
    // trap only intervenes at the first/last element), then wraps from the
    // true first element (close button) to the true last (textarea).
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(suggestion3);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(suggestion2);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(suggestion1);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(closeButton);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(textarea);

    // Forward Tab from the true last element wraps to the true first.
    await user.tab();
    expect(document.activeElement).toBe(closeButton);
    await user.tab();
    expect(document.activeElement).toBe(suggestion1);
  });

  it("pulls focus back into the panel on the next Tab if it ends up outside via a non-Tab route", async () => {
    const user = userEvent.setup();
    const { getByText, getByLabelText } = render(<Harness />, { wrapper });

    await user.click(getByText("open-trigger"));
    const textarea = getByLabelText(i18n.t("chat:inputLabel"));
    expect(document.activeElement).toBe(textarea);

    // Simulate focus escaping the panel via a route other than Tab (e.g. a
    // click on a non-focusable area lands focus on <body>) rather than being
    // caught by the keydown handler.
    act(() => {
      textarea.blur();
    });
    expect(document.activeElement).not.toBe(textarea);
    expect(document.activeElement && textarea.contains(document.activeElement)).toBeFalsy();

    const closeButton = getByLabelText(i18n.t("chat:close"));
    await user.tab();
    expect(document.activeElement).toBe(closeButton);
  });
});
