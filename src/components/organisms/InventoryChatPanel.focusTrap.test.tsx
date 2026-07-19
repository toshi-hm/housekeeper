import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { type ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

// InventoryChatPanel pulls in useInventoryChat, which invokes the
// `inventory-chat` Supabase Edge Function via `@/lib/supabase`. That module
// throws at import time unless Supabase env vars are configured, and it also
// performs real network calls, neither of which are relevant to the focus
// management under test here, so the hook is stubbed out.
mock.module("@/hooks/useInventoryChat", () => ({
  useInventoryChat: () => ({
    ask: () => Promise.resolve({ reply: "", items: [] }),
    isLoading: false,
    isError: false,
    reset: () => {},
  }),
}));

import { InventoryChatPanel } from "./InventoryChatPanel";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

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
});
