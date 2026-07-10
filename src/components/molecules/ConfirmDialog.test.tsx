import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="削除"
        message="削除しますか？"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when open", () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="削除の確認"
        message="削除しますか？"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { wrapper },
    );
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("削除の確認");
    expect(dialog?.textContent).toContain("削除しますか？");
  });

  it("calls onCancel when backdrop is clicked and not confirming", () => {
    const onCancel = mock(() => {});
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="削除"
        message="削除しますか？"
        isConfirming={false}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
      { wrapper },
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onCancel when backdrop is clicked while isConfirming=true", () => {
    const onCancel = mock(() => {});
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="削除"
        message="削除しますか？"
        isConfirming={true}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
      { wrapper },
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables buttons when isConfirming=true", () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="削除"
        message="削除しますか？"
        isConfirming={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { wrapper },
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("shows spinner in confirm button when isConfirming=true", () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="削除"
        message="削除しますか？"
        isConfirming={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { wrapper },
    );
    const spinner = container.querySelector('[role="status"]');
    expect(spinner).not.toBeNull();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = mock(() => {});
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="削除"
        message="削除しますか？"
        confirmLabel="削除する"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
      { wrapper },
    );
    const buttons = container.querySelectorAll("button");
    const confirmBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("削除する"),
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDialog (キーボード操作の分岐)", () => {
  it("Escape キーで onCancel が呼ばれる (isConfirming 中は無視)", () => {
    const onCancel = mock(() => {});
    const { rerender } = render(
      <ConfirmDialog
        open={true}
        title="確認"
        message="よろしいですか？"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
      { wrapper },
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    // isConfirming 中は Escape を無視する
    rerender(
      <I18nextProvider i18n={i18n}>
        <ConfirmDialog
          open={true}
          title="確認"
          message="よろしいですか？"
          isConfirming={true}
          onConfirm={() => {}}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Escape 以外のキーは無視する
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("isConfirming 中は確定ボタンにスピナーを表示する (既定ラベル)", () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="確認"
        message="よろしいですか？"
        isConfirming={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { wrapper },
    );

    expect(container.querySelector('[role="status"], .animate-spin')).not.toBeNull();
  });
});
