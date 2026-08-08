import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { BulkMoveDialog } from "./BulkMoveDialog";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const options = [
  { id: "loc-1", name: "冷蔵庫" },
  { id: "loc-2", name: "パントリー" },
];

describe("BulkMoveDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <BulkMoveDialog
        open={false}
        title="保管場所を一括変更"
        noneLabel="未設定"
        confirmLabel="変更"
        cancelLabel="キャンセル"
        options={options}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("再度開いたとき、前回選択した値をリセットする (#773)", () => {
    const onConfirm = mock(() => undefined);
    const { getByRole, rerender } = render(
      <BulkMoveDialog
        open={true}
        title="保管場所を一括変更"
        noneLabel="未設定"
        confirmLabel="変更"
        cancelLabel="キャンセル"
        options={options}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
      { wrapper },
    );

    const select = getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "loc-2" } });
    expect(select.value).toBe("loc-2");

    // ダイアログを閉じる(キャンセル相当)。render(..., {wrapper}) の wrapper は
    // rerender() でも自動的に再適用されるため、ここで再度 I18nextProvider を
    // 手動で被せると同じ位置の要素型が変わってReactが別コンポーネントとして
    // アンマウント・再マウントしてしまい(state が失われ)、意図せずテストが
    // 常に成功してしまう(#773 のバグを再現できない)。
    rerender(
      <BulkMoveDialog
        open={false}
        title="保管場所を一括変更"
        noneLabel="未設定"
        confirmLabel="変更"
        cancelLabel="キャンセル"
        options={options}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    // 再び開く
    rerender(
      <BulkMoveDialog
        open={true}
        title="保管場所を一括変更"
        noneLabel="未設定"
        confirmLabel="変更"
        cancelLabel="キャンセル"
        options={options}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    const reopenedSelect = getByRole("combobox") as HTMLSelectElement;
    expect(reopenedSelect.value).toBe("");
  });
});
