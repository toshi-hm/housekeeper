import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { CHAT_MAX_MESSAGE_LENGTH } from "@/types/chat";

import { ChatComposer } from "./ChatComposer";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ChatComposer", () => {
  test("shows the current and maximum character count", async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = render(<ChatComposer onSend={() => {}} />, { wrapper });

    await user.type(getByRole("textbox"), "hello");

    expect(getByText(new RegExp(`5\\s*/\\s*${CHAT_MAX_MESSAGE_LENGTH}`))).toBeDefined();
  });

  test("does not accept text beyond the shared maximum length", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<ChatComposer onSend={() => {}} />, { wrapper });
    const textarea = getByRole("textbox") as HTMLTextAreaElement;

    await user.click(textarea);
    await user.paste("a".repeat(CHAT_MAX_MESSAGE_LENGTH + 1));

    expect(textarea.value.length).toBe(CHAT_MAX_MESSAGE_LENGTH);
  });

  test("submits a trimmed message with Enter and clears the input", async () => {
    const user = userEvent.setup();
    const onSend = mock(() => {});
    const { getByRole } = render(<ChatComposer onSend={onSend} />, { wrapper });
    const textarea = getByRole("textbox") as HTMLTextAreaElement;

    await user.type(textarea, "  milk?  {Enter}");

    expect(onSend).toHaveBeenCalledWith("milk?");
    expect(textarea.value).toBe("");
  });
});
