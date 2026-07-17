import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ShoppingTemplatesPanel } from "./ShoppingTemplatesPanel";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nextProvider, { i18n }, children);

const noop = () => {};

afterEach(cleanup);

describe("ShoppingTemplatesPanel", () => {
  test("保存が失敗したらエディタを閉じず入力内容を保持する (#521)", async () => {
    const user = userEvent.setup();
    const onSave = mock(() => Promise.reject(new Error("offline")));

    const { getByText, getByPlaceholderText, queryByPlaceholderText } = render(
      <ShoppingTemplatesPanel templates={[]} onApply={noop} onSave={onSave} onDelete={noop} />,
      { wrapper },
    );

    // 新規テンプレートエディタを開く
    await user.click(getByText(i18n.t("shopping:templateCreate")));

    const nameInput = getByPlaceholderText(i18n.t("shopping:templateNamePlaceholder"));
    await user.type(nameInput, "週次まとめ買い");

    // 保存（mutation は失敗する）
    await user.click(getByText(i18n.t("shopping:editSave")));

    expect(onSave).toHaveBeenCalledTimes(1);
    // 失敗したのでエディタは開いたまま、入力内容(名前)も保持されている
    expect(queryByPlaceholderText(i18n.t("shopping:templateNamePlaceholder"))).not.toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe("週次まとめ買い");
  });

  test("保存が成功したらエディタを閉じる (#521)", async () => {
    const user = userEvent.setup();
    const onSave = mock(() => Promise.resolve());

    const { getByText, getByPlaceholderText, queryByPlaceholderText } = render(
      <ShoppingTemplatesPanel templates={[]} onApply={noop} onSave={onSave} onDelete={noop} />,
      { wrapper },
    );

    await user.click(getByText(i18n.t("shopping:templateCreate")));
    await user.type(getByPlaceholderText(i18n.t("shopping:templateNamePlaceholder")), "週次");
    await user.click(getByText(i18n.t("shopping:editSave")));

    expect(onSave).toHaveBeenCalledTimes(1);
    // 成功したのでエディタは閉じ、名前入力は消えている
    expect(queryByPlaceholderText(i18n.t("shopping:templateNamePlaceholder"))).toBeNull();
  });
});
