import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { ReceiptDraftItem } from "@/types/receipt";

import { ReceiptLineItemRow, type ReceiptRowStatus } from "./ReceiptLineItemRow";

const draft: ReceiptDraftItem = {
  id: "d1",
  name: "牛乳",
  quantity: 1,
  unitPrice: 248,
  confidence: "high",
  categoryId: null,
  storageLocationId: null,
  expiryDate: null,
  included: true,
};

const renderRow = (status?: ReceiptRowStatus, onRemove = () => {}) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ReceiptLineItemRow
        draft={draft}
        categories={[]}
        locations={[]}
        status={status}
        onChange={() => {}}
        onRemove={onRemove}
      />
    </I18nextProvider>,
  );

// #923: 一括登録が部分失敗した場合、failed行はDBに何も残っていないので
// pendingと同じくレビュー一覧から削除できて良い。registering/successは
// 進行中・確定済みのため削除ボタンを出さない。
describe("ReceiptLineItemRow delete button (#923)", () => {
  test("shows the delete button and calls onRemove for a pending row", () => {
    const onRemove = mock(() => {});
    const { getByRole } = renderRow("pending", onRemove);

    fireEvent.click(getByRole("button", { name: i18n.t("removeRow", { ns: "receiptScan" }) }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test("shows the delete button and calls onRemove for a failed row", () => {
    const onRemove = mock(() => {});
    const { getByRole } = renderRow("failed", onRemove);

    fireEvent.click(getByRole("button", { name: i18n.t("removeRow", { ns: "receiptScan" }) }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test("does not show the delete button while registering", () => {
    const { queryByRole } = renderRow("registering");
    expect(queryByRole("button", { name: i18n.t("removeRow", { ns: "receiptScan" }) })).toBeNull();
  });

  test("does not show the delete button once succeeded", () => {
    const { queryByRole } = renderRow("success");
    expect(queryByRole("button", { name: i18n.t("removeRow", { ns: "receiptScan" }) })).toBeNull();
  });
});
