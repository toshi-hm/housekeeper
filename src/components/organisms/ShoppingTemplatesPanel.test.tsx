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

  test("数量欄は空欄を許容し、小数は blur 時に整数へ丸めて保存される (#1303)", async () => {
    const user = userEvent.setup();
    const onSave = mock(() => Promise.resolve());

    const { getByText, getByPlaceholderText, getByLabelText } = render(
      <ShoppingTemplatesPanel templates={[]} onApply={noop} onSave={onSave} onDelete={noop} />,
      { wrapper },
    );

    await user.click(getByText(i18n.t("shopping:templateCreate")));
    await user.type(getByPlaceholderText(i18n.t("shopping:templateNamePlaceholder")), "週次");
    await user.type(getByPlaceholderText(i18n.t("shopping:itemNamePlaceholder")), "牛乳");

    const units = getByLabelText(i18n.t("shopping:desiredUnits")) as HTMLInputElement;
    await user.clear(units);
    // 空欄にしても即座に 1 へ戻らない
    expect(units.value).toBe("");
    await user.type(units, "2.6");
    await user.tab();
    // blur で整数へ確定
    expect(units.value).toBe("3");

    await user.click(getByText(i18n.t("shopping:editSave")));
    expect(onSave).toHaveBeenCalledWith({
      id: undefined,
      name: "週次",
      items: [{ name: "牛乳", desired_units: 3 }],
    });
  });

  test("数量欄を空のまま blur すると 1 に確定する (#1303)", async () => {
    const user = userEvent.setup();
    const { getByText, getByLabelText } = render(
      <ShoppingTemplatesPanel
        templates={[]}
        onApply={noop}
        onSave={noop as never}
        onDelete={noop}
      />,
      { wrapper },
    );
    await user.click(getByText(i18n.t("shopping:templateCreate")));
    const units = getByLabelText(i18n.t("shopping:desiredUnits")) as HTMLInputElement;
    await user.clear(units);
    await user.tab();
    expect(units.value).toBe("1");
  });
});
