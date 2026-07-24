import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import { useDialogA11y } from "./useDialogA11y";

interface HarnessProps {
  open: boolean;
  onClose: () => void;
  disableClose?: boolean;
}

/** ダイアログ本体を模した最小限のハーネス。フォーカストラップ検証用に3つの
 *  フォーカス可能要素（closeボタン・input・confirmボタン）を持つ。 */
const Harness = ({ open, onClose, disableClose }: HarnessProps) => {
  const containerRef = useDialogA11y<HTMLDivElement>({ open, onClose, disableClose });
  if (!open) return null;
  return (
    <div>
      <button type="button">outside</button>
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <button type="button">close</button>
        <input placeholder="name" />
        <button type="button">confirm</button>
      </div>
    </div>
  );
};

describe("useDialogA11y (#631)", () => {
  test("オープン時にダイアログ内の最初のフォーカス可能要素へ初期フォーカスする", () => {
    const { getByText } = render(<Harness open={true} onClose={() => {}} />);
    expect(document.activeElement).toBe(getByText("close"));
  });

  test("Escapeキーでoncloseが呼ばれる", () => {
    const onClose = mock(() => {});
    render(<Harness open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("disableCloseがtrueの間はEscapeキーで閉じない", () => {
    const onClose = mock(() => {});
    render(<Harness open={true} onClose={onClose} disableClose={true} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("最後の要素でTabを押すと先頭の要素にフォーカスが循環する（フォーカストラップ）", () => {
    const { getByText } = render(<Harness open={true} onClose={() => {}} />);
    const confirmButton = getByText("confirm");
    confirmButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(getByText("close"));
  });

  test("先頭の要素でShift+Tabを押すと末尾の要素にフォーカスが循環する", () => {
    const { getByText } = render(<Harness open={true} onClose={() => {}} />);
    const closeButton = getByText("close");
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByText("confirm"));
  });

  test("クローズ時にオープン前にフォーカスされていた要素へ復元する", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<Harness open={true} onClose={() => {}} />);
    rerender(<Harness open={false} onClose={() => {}} />);

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
