import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { QuickMemoSheet } from "./QuickMemoSheet";

// テスト実行時に言語検出が非同期で確定するため、日英どちらの表示でもマッチするようにする
const SAVE_NAME = /保存|Save/i;
const CANCEL_NAME = /キャンセル|Cancel/i;
const CLOSE_NAME = /閉じる|Close/i;

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("QuickMemoSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <QuickMemoSheet
        open={false}
        itemName="牛乳"
        initialNotes=""
        onSave={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the item name and pre-fills the textarea with the current notes", () => {
    const { container, getByRole } = render(
      <QuickMemoSheet
        open={true}
        itemName="牛乳"
        initialNotes="開封済み"
        onSave={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(container.textContent).toContain("牛乳");
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("開封済み");
    expect(getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(textarea);
  });

  it("calls onSave with the edited notes when the save button is clicked", async () => {
    const user = userEvent.setup();
    const onSave = mock((notes: string) => notes);
    const { getByRole } = render(
      <QuickMemoSheet
        open={true}
        itemName="牛乳"
        initialNotes="開封済み"
        onSave={onSave}
        onClose={() => {}}
      />,
      { wrapper },
    );
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "残り半分");
    const saveButton = getByRole("button", { name: SAVE_NAME });
    await user.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("残り半分");
  });

  it("disables the save button when the notes are unchanged", () => {
    const { getByRole } = render(
      <QuickMemoSheet
        open={true}
        itemName="牛乳"
        initialNotes="開封済み"
        onSave={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    const saveButton = getByRole("button", { name: SAVE_NAME }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = mock(() => {});
    const { getByRole } = render(
      <QuickMemoSheet
        open={true}
        itemName="牛乳"
        initialNotes=""
        onSave={() => {}}
        onClose={onClose}
      />,
      { wrapper },
    );
    const cancelButton = getByRole("button", { name: CANCEL_NAME });
    fireEvent.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables buttons and shows a spinner while isSubmitting", () => {
    const { container } = render(
      <QuickMemoSheet
        open={true}
        itemName="牛乳"
        initialNotes="開封済み"
        isSubmitting={true}
        onSave={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it("traps focus, restores the trigger focus, and makes the background inert", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.append(trigger);
    trigger.focus();

    const { getByRole, getByTestId, rerender } = render(
      <>
        <main data-testid="background">inventory</main>
        <QuickMemoSheet
          open={true}
          itemName="牛乳"
          initialNotes=""
          onSave={() => {}}
          onClose={() => {}}
        />
      </>,
      { wrapper },
    );
    const background = getByTestId("background");
    const textarea = getByRole("textbox");
    const closeButton = getByRole("button", { name: CLOSE_NAME });
    const cancelButton = getByRole("button", { name: CANCEL_NAME });
    expect(background.inert).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(textarea);

    cancelButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);

    rerender(
      <>
        <main data-testid="background">inventory</main>
        <QuickMemoSheet
          open={false}
          itemName="牛乳"
          initialNotes=""
          onSave={() => {}}
          onClose={() => {}}
        />
      </>,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
