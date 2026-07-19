import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { CHAT_MAX_MESSAGE_LENGTH } from "@/types/chat";

import { ChatComposer } from "./ChatComposer";

const makeWrapper =
  () =>
  ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  );

describe("ChatComposer", () => {
  it("does not show the character counter for a short message", async () => {
    const user = userEvent.setup();
    const { getByRole, queryByText } = render(<ChatComposer onSend={() => {}} />, {
      wrapper: makeWrapper(),
    });
    await user.type(getByRole("textbox"), "牛乳ある？");
    expect(queryByText(/\/500/)).toBeNull();
  });

  it("shows the character counter once close to the limit", async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = render(<ChatComposer onSend={() => {}} />, {
      wrapper: makeWrapper(),
    });
    const longText = "a".repeat(CHAT_MAX_MESSAGE_LENGTH - 10);
    await user.type(getByRole("textbox"), longText);
    expect(getByText(`${longText.length}/${CHAT_MAX_MESSAGE_LENGTH}`)).toBeDefined();
  }, 10000);

  it("stops accepting input once the max length is reached", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<ChatComposer onSend={() => {}} />, { wrapper: makeWrapper() });
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    await user.click(textarea);
    await user.paste("a".repeat(CHAT_MAX_MESSAGE_LENGTH + 100));
    expect(textarea.value.length).toBe(CHAT_MAX_MESSAGE_LENGTH);
  });

  it("disables the send button while the message is empty", () => {
    const { getByRole } = render(<ChatComposer onSend={() => {}} />, { wrapper: makeWrapper() });
    expect((getByRole("button", { name: i18n.t("chat:send") }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("submits the trimmed message on Enter and clears the input", async () => {
    const user = userEvent.setup();
    const onSend = mock(() => {});
    const { getByRole } = render(<ChatComposer onSend={onSend} />, { wrapper: makeWrapper() });
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    await user.type(textarea, "牛乳ある？{Enter}");
    expect(onSend).toHaveBeenCalledWith("牛乳ある？");
    expect(textarea.value).toBe("");
  });
});
