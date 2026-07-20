import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { DeletionReasonDialog } from "./DeletionReasonDialog";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("DeletionReasonDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <DeletionReasonDialog
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

  it("renders dialog with all three reason options when open", () => {
    const { container } = render(
      <DeletionReasonDialog
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
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(3);
  });

  it("defaults to 'consumed' as the selected reason", () => {
    const { container } = render(
      <DeletionReasonDialog
        open={true}
        title="削除の確認"
        message="削除しますか？"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { wrapper },
    );
    const consumedRadio = container.querySelector('input[value="consumed"]') as HTMLInputElement;
    expect(consumedRadio.checked).toBe(true);
  });

  it("calls onConfirm with the selected reason", () => {
    const onConfirm = mock(() => {});
    const { container } = render(
      <DeletionReasonDialog
        open={true}
        title="削除の確認"
        message="削除しますか？"
        confirmLabel="削除する"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
      { wrapper },
    );

    const wasteRadio = container.querySelector('input[value="expired_waste"]') as HTMLInputElement;
    fireEvent.click(wasteRadio);

    const buttons = container.querySelectorAll("button");
    const confirmBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("削除する"),
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("expired_waste");
  });

  it("calls onCancel when backdrop is clicked and not confirming", () => {
    const onCancel = mock(() => {});
    const { container } = render(
      <DeletionReasonDialog
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

  it("disables inputs and buttons when isConfirming=true", () => {
    const { container } = render(
      <DeletionReasonDialog
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
    const radios = container.querySelectorAll("input[type='radio']");
    radios.forEach((radio) => {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    });
  });
});
