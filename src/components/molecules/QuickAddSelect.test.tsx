import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { QuickAddSelect } from "@/components/molecules/QuickAddSelect";
import i18n from "@/lib/i18n";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const options = [
  { value: "opt-1", label: "冷蔵庫" },
  { value: "opt-2", label: "パントリー" },
];

const renderSelect = (props: Partial<Parameters<typeof QuickAddSelect>[0]> = {}) => {
  const defaultProps = {
    id: "quick-select",
    value: "",
    onChange: () => {},
    options,
    placeholder: "選択してください",
    onAdd: () => Promise.resolve(),
    addLabel: "追加",
    confirmLabel: "確定",
    cancelLabel: "キャンセル",
    addErrorMessage: "追加に失敗しました",
  };
  return render(<QuickAddSelect {...defaultProps} {...props} />, { wrapper });
};

describe("QuickAddSelect", () => {
  test("トリガーにプレースホルダー / 選択中ラベルを表示する", () => {
    const { getByText, rerender } = renderSelect();
    expect(getByText("選択してください")).toBeTruthy();

    rerender(
      <I18nextProvider i18n={i18n}>
        <QuickAddSelect
          id="quick-select"
          value="opt-1"
          onChange={() => {}}
          options={options}
          placeholder="選択してください"
          onAdd={() => Promise.resolve()}
        />
      </I18nextProvider>,
    );
    expect(getByText("冷蔵庫")).toBeTruthy();
  });

  test("トリガークリックで開閉できる", () => {
    const { getByRole, queryByRole } = renderSelect();
    const trigger = getByRole("button", { name: /選択してください/ });

    fireEvent.click(trigger);
    expect(queryByRole("listbox")).not.toBeNull();

    fireEvent.click(trigger);
    expect(queryByRole("listbox")).toBeNull();
  });

  test("オプション選択で onChange が呼ばれ閉じる", () => {
    const onChange = mock(() => {});
    const { getByRole, getByText, queryByRole } = renderSelect({ onChange });

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("パントリー"));

    expect(onChange).toHaveBeenCalledWith("opt-2");
    expect(queryByRole("listbox")).toBeNull();
  });

  test("クリアオプションで空文字を選択できる", () => {
    const onChange = mock(() => {});
    const { getByRole, getAllByRole } = renderSelect({ value: "opt-1", onChange });

    fireEvent.click(getByRole("button", { name: /冷蔵庫/ }));
    const optionButtons = getAllByRole("option");
    fireEvent.click(optionButtons[0]!);

    expect(onChange).toHaveBeenCalledWith("");
  });

  test("追加フロー: 入力 → 確定で onAdd が呼ばれる", async () => {
    const user = userEvent.setup();
    const onAdd = mock(() => Promise.resolve());
    const { getByRole, getByText, getByPlaceholderText, queryByRole } = renderSelect({ onAdd });

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("追加"));

    await user.type(getByPlaceholderText("追加"), "  新しい場所  ");
    fireEvent.click(getByRole("button", { name: "確定" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("新しい場所"));
    await waitFor(() => expect(queryByRole("listbox")).toBeNull());
  });

  test("追加フロー: Enter キーでも確定できる", async () => {
    const user = userEvent.setup();
    const onAdd = mock(() => Promise.resolve());
    const { getByRole, getByText, getByPlaceholderText } = renderSelect({ onAdd });

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("追加"));

    const input = getByPlaceholderText("追加");
    await user.type(input, "エンター追加");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("エンター追加"));
  });

  test("追加失敗でエラーメッセージを表示する", async () => {
    const user = userEvent.setup();
    const onAdd = mock(() => Promise.reject(new Error("add failed")));
    const { getByRole, getByText, getByPlaceholderText } = renderSelect({ onAdd });

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("追加"));

    await user.type(getByPlaceholderText("追加"), "失敗する");
    fireEvent.click(getByRole("button", { name: "確定" }));

    await waitFor(() => expect(getByText("追加に失敗しました")).toBeTruthy());
  });

  test("空入力では確定ボタンが無効", () => {
    const { getByRole, getByText } = renderSelect();

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("追加"));

    const confirmButton = getByRole("button", { name: "確定" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });

  test("キャンセルで追加モードを終了する", () => {
    const { getByRole, getByText, queryByPlaceholderText } = renderSelect();

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("追加"));
    expect(queryByPlaceholderText("追加")).not.toBeNull();

    fireEvent.click(getByRole("button", { name: "キャンセル" }));
    expect(queryByPlaceholderText("追加")).toBeNull();
  });

  test("入力中の Escape でキャンセルされる", () => {
    const { getByRole, getByText, getByPlaceholderText, queryByPlaceholderText } = renderSelect();

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    fireEvent.click(getByText("追加"));

    fireEvent.keyDown(getByPlaceholderText("追加"), { key: "Escape" });
    expect(queryByPlaceholderText("追加")).toBeNull();
  });

  test("削除ボタンで onDelete が呼ばれ、選択中の値なら onChange('') も呼ばれる", async () => {
    const onDelete = mock(() => Promise.resolve());
    const onChange = mock(() => {});
    const { getByRole, getAllByLabelText } = renderSelect({
      value: "opt-1",
      onDelete,
      onChange,
    });

    fireEvent.click(getByRole("button", { name: /冷蔵庫/ }));
    const deleteButtons = getAllByLabelText(/削除|delete/i);
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("opt-1"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });

  test("削除失敗でエラーメッセージを表示する", async () => {
    const onDelete = mock(() => Promise.reject(new Error("削除できません")));
    const { getByRole, getAllByLabelText, getByText } = renderSelect({ onDelete });

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    const deleteButtons = getAllByLabelText(/削除|delete/i);
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => expect(getByText("削除できません")).toBeTruthy());
  });

  test("キーボード操作: ArrowDown で開き Escape で閉じる", () => {
    const { getByRole, queryByRole } = renderSelect();
    const trigger = getByRole("button", { name: /選択してください/ });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(queryByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(queryByRole("listbox")).toBeNull();

    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(queryByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(trigger, { key: " " });
    expect(queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(trigger, { key: " " });
    expect(queryByRole("listbox")).not.toBeNull();
  });

  test("オプション上のキーボード操作 (ArrowDown / ArrowUp / Escape / Tab)", () => {
    const { getByRole, getAllByRole, queryByRole } = renderSelect();
    const trigger = getByRole("button", { name: /選択してください/ });

    fireEvent.click(trigger);
    const optionButtons = getAllByRole("option");

    // ArrowDown: 次のオプションへ (フォーカス移動のみ、開いたまま)
    fireEvent.keyDown(optionButtons[0]!, { key: "ArrowDown" });
    expect(queryByRole("listbox")).not.toBeNull();

    // ArrowUp: index 1 → index 0 (開いたまま)
    fireEvent.keyDown(optionButtons[1]!, { key: "ArrowUp" });
    expect(queryByRole("listbox")).not.toBeNull();

    // 先頭で ArrowUp → 閉じる
    fireEvent.keyDown(optionButtons[0]!, { key: "ArrowUp" });
    expect(queryByRole("listbox")).toBeNull();

    // Escape で閉じる
    fireEvent.click(trigger);
    fireEvent.keyDown(getAllByRole("option")[0]!, { key: "Escape" });
    expect(queryByRole("listbox")).toBeNull();

    // Tab で閉じる
    fireEvent.click(trigger);
    fireEvent.keyDown(getAllByRole("option")[0]!, { key: "Tab" });
    expect(queryByRole("listbox")).toBeNull();
  });

  test("外側クリックで閉じる", () => {
    const { getByRole, queryByRole } = renderSelect();

    fireEvent.click(getByRole("button", { name: /選択してください/ }));
    expect(queryByRole("listbox")).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(queryByRole("listbox")).toBeNull();
  });
});
