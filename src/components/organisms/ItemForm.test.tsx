import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import i18n from "@/lib/i18n";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";
import type { ItemFormValues } from "@/types/item";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { ItemForm } = await import("@/components/organisms/ItemForm");

const makeCategoryRow = (id: string, name: string) => ({
  id,
  user_id: "user-1",
  name,
  color: null,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const renderForm = (props: Partial<Parameters<typeof ItemForm>[0]> = {}) => {
  const { wrapper: Wrapper, toastCalls } = createHookWrapper();
  const onSubmit = mock(() => {});
  const utils = render(
    <Wrapper>
      <ItemForm onSubmit={onSubmit} {...props} />
    </Wrapper>,
  );
  return { ...utils, onSubmit, toastCalls };
};

const submitForm = (container: HTMLElement) => {
  const form = container.querySelector("form") as HTMLFormElement;
  fireEvent.submit(form);
};

beforeEach(() => {
  sb.reset();
});

describe("ItemForm", () => {
  test("名前が空だと必須エラーを表示して送信しない", async () => {
    const { container, onSubmit, getByText } = renderForm();

    submitForm(container);

    await waitFor(() => expect(getByText(i18n.t("common:required"))).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("名前を入力すると送信できる (正規化された値)", async () => {
    const { container, onSubmit } = renderForm();

    const nameInput = container.querySelector("#name") as HTMLInputElement;
    await userEvent.type(nameInput, "テスト食品");

    submitForm(container);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = (onSubmit.mock.calls[0] as unknown[])[0] as ItemFormValues;
    expect(values.name).toBe("テスト食品");
    expect(values.units).toBe(1);
    expect(values.content_amount).toBe(1);
    expect(values.barcode).toBeUndefined();
    expect(values.purchase_date).toBeUndefined();
  });

  test("defaultValues が初期値として反映される", () => {
    const { container } = renderForm({
      defaultValues: {
        name: "既存アイテム",
        barcode: "4901",
        units: 3,
        content_amount: 2.5,
        notes: "メモ",
        purchase_date: "2026-06-01",
        expiry_date: "2026-12-31",
        minimum_stock: 2,
      },
    });

    expect((container.querySelector("#name") as HTMLInputElement).value).toBe("既存アイテム");
    expect((container.querySelector("#barcode") as HTMLInputElement).value).toBe("4901");
    expect((container.querySelector("#units") as HTMLInputElement).value).toBe("3");
    expect((container.querySelector("#content_amount") as HTMLInputElement).value).toBe("2.5");
    expect((container.querySelector("#notes") as HTMLTextAreaElement).value).toBe("メモ");
    expect((container.querySelector("#minimum_stock") as HTMLInputElement).value).toBe("2");
  });

  test("個数が空だと unitsRequired エラー", async () => {
    const { container, onSubmit, getByText } = renderForm({
      defaultValues: { name: "テスト" },
    });

    const unitsInput = container.querySelector("#units") as HTMLInputElement;
    await userEvent.type(unitsInput, "{backspace}");

    submitForm(container);

    await waitFor(() => expect(getByText(i18n.t("items:unitsRequired"))).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("個数 0 は unitsPositive エラー", async () => {
    const { container, onSubmit, getByText } = renderForm({
      defaultValues: { name: "テスト" },
    });

    const unitsInput = container.querySelector("#units") as HTMLInputElement;
    await userEvent.type(unitsInput, "{backspace}0");

    await waitFor(() => expect(getByText(i18n.t("items:unitsPositive"))).toBeTruthy());

    submitForm(container);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("個数に数字以外は入力できない", async () => {
    const { container } = renderForm();

    const unitsInput = container.querySelector("#units") as HTMLInputElement;
    await userEvent.type(unitsInput, "abc");
    expect(unitsInput.value).toBe("1");
  });

  test("内容量が空だと contentAmountRequired エラー", async () => {
    const { container, onSubmit, getByText } = renderForm({
      defaultValues: { name: "テスト" },
    });

    const amountInput = container.querySelector("#content_amount") as HTMLInputElement;
    await userEvent.type(amountInput, "{backspace}");

    submitForm(container);

    await waitFor(() => expect(getByText(i18n.t("items:contentAmountRequired"))).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("単位や日付・備考・最低在庫を変更して送信できる", async () => {
    const { container, onSubmit } = renderForm({ defaultValues: { name: "テスト" } });

    fireEvent.change(container.querySelector("#content_unit") as HTMLSelectElement, {
      target: { value: "g" },
    });
    await userEvent.type(
      container.querySelector("#purchase_date") as HTMLInputElement,
      "2026-06-01",
    );
    await userEvent.type(container.querySelector("#expiry_date") as HTMLInputElement, "2026-12-31");
    await userEvent.type(container.querySelector("#notes") as HTMLTextAreaElement, "備考です");
    await userEvent.type(container.querySelector("#minimum_stock") as HTMLInputElement, "5");

    submitForm(container);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const values = (onSubmit.mock.calls[0] as unknown[])[0] as ItemFormValues;
    expect(values.content_unit).toBe("g");
    expect(values.purchase_date).toBe("2026-06-01");
    expect(values.expiry_date).toBe("2026-12-31");
    expect(values.notes).toBe("備考です");
    expect(values.minimum_stock).toBe(5);
  });

  test("minimum_stock を空にすると null になる", async () => {
    const { container, onSubmit } = renderForm({
      defaultValues: { name: "テスト", minimum_stock: 4 },
    });

    await userEvent.type(
      container.querySelector("#minimum_stock") as HTMLInputElement,
      "{backspace}",
    );

    submitForm(container);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const values = (onSubmit.mock.calls[0] as unknown[])[0] as ItemFormValues;
    expect(values.minimum_stock).toBeNull();
  });

  test("バーコード検索: DB ヒットで名前を自動入力し履歴由来メッセージを表示する", async () => {
    // useBarcodeLookup のローカル検索 (items)
    sb.enqueue("items", { data: { name: "既知の牛乳", image_path: null } });

    const { container, getByText } = renderForm();

    const barcodeInput = container.querySelector("#barcode") as HTMLInputElement;
    await userEvent.type(barcodeInput, "4901234567890");

    const searchButton = container
      .querySelector("svg.lucide-search")
      ?.closest("button") as HTMLButtonElement;
    fireEvent.click(searchButton);

    await waitFor(() =>
      expect((container.querySelector("#name") as HTMLInputElement).value).toBe("既知の牛乳"),
    );
    expect(getByText(i18n.t("items:lookupFromHistory"))).toBeTruthy();
  });

  test("バーコード入力欄で Enter キーでも検索する", async () => {
    sb.enqueue("items", { data: { name: "エンター商品", image_path: null } });

    const { container } = renderForm();

    const barcodeInput = container.querySelector("#barcode") as HTMLInputElement;
    await userEvent.type(barcodeInput, "4900000000009");
    fireEvent.keyDown(barcodeInput, { key: "Enter" });

    await waitFor(() =>
      expect((container.querySelector("#name") as HTMLInputElement).value).toBe("エンター商品"),
    );
  });

  test("API ヒットで画像 URL を親に通知する", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({
      data: {
        product: {
          name: "API商品",
          description: null,
          image_url: "https://img.example/api.jpg",
          brand: null,
        },
      },
      error: null,
    });

    const onPendingImageUrlChange = mock(() => {});
    const onBarcodeScanned = mock(() => {});
    const { container } = renderForm({ onPendingImageUrlChange, onBarcodeScanned });

    await userEvent.type(container.querySelector("#barcode") as HTMLInputElement, "4909");
    fireEvent.click(container.querySelector("svg.lucide-search")?.closest("button") as HTMLElement);

    await waitFor(() =>
      expect(onPendingImageUrlChange).toHaveBeenCalledWith("https://img.example/api.jpg"),
    );
    expect(onBarcodeScanned).toHaveBeenCalledWith("4909", "api");

    // 商品画像がフォーム内に表示される
    expect(container.querySelector('img[src="https://img.example/api.jpg"]')).not.toBeNull();
  });

  test("スキャナーを開いて閉じられる", async () => {
    const { container } = renderForm();

    const scanButton = container
      .querySelector("svg.lucide-barcode")
      ?.closest("button") as HTMLButtonElement;
    fireEvent.click(scanButton);

    // BarcodeScanner が表示される (カメラ不可でもエラー UI が出る)
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());

    const closeButton = container.querySelector("svg.lucide-x")?.closest("button");
    fireEvent.click(closeButton!);
    await waitFor(() => expect(container.querySelector("video")).toBeNull());
  });

  test("カテゴリの追加で category_id が設定される", async () => {
    const newCategory = makeCategoryRow("cat-new", "新カテゴリ");
    sb.enqueue("categories", { data: [] }); // useCategories 初期フェッチ
    sb.enqueue("storage_locations", { data: [] });
    sb.enqueue("categories", { data: newCategory }); // insert

    const { container, getByText, getByPlaceholderText } = renderForm();

    // カテゴリの QuickAddSelect を開く
    const trigger = container.querySelector("#category_id") as HTMLButtonElement;
    fireEvent.click(trigger);

    fireEvent.click(getByText(i18n.t("items:addCategory")));
    await userEvent.type(getByPlaceholderText(i18n.t("items:addCategory")), "新カテゴリ");

    const confirmButton = container.querySelector(
      `#category_id ~ div button[aria-label="${i18n.t("common:confirm")}"]`,
    ) as HTMLButtonElement;
    fireEvent.click(confirmButton);

    // 追加後はトリガーに新カテゴリ名が表示される
    await waitFor(() => expect(trigger.textContent).toContain("新カテゴリ"));
  });

  test("使用中カテゴリの削除はエラーメッセージを表示する", async () => {
    sb.enqueue("categories", { data: [makeCategoryRow("cat-1", "使用中カテゴリ")] });
    sb.enqueue("storage_locations", { data: [] });

    const { container, getByText } = renderForm();

    const trigger = container.querySelector("#category_id") as HTMLButtonElement;
    fireEvent.click(trigger);
    await waitFor(() => expect(getByText("使用中カテゴリ")).toBeTruthy());

    // checkCategoryUsage → 使用中 (count 2)
    sb.enqueue("items", { count: 2, error: null });

    const deleteButton = container.querySelector(
      `button[aria-label="${i18n.t("common:delete")}"]`,
    ) as HTMLButtonElement;
    fireEvent.click(deleteButton);

    await waitFor(() => expect(getByText(i18n.t("settings:categoryInUse"))).toBeTruthy());
  });

  test("未使用の保管場所は削除できる", async () => {
    sb.enqueue("categories", { data: [] });
    sb.enqueue("storage_locations", { data: [makeCategoryRow("loc-1", "空の棚")] });

    const { container, getByText, queryByText } = renderForm();

    const trigger = container.querySelector("#storage_location_id") as HTMLButtonElement;
    fireEvent.click(trigger);
    await waitFor(() => expect(getByText("空の棚")).toBeTruthy());

    sb.enqueue("items", { count: 0, error: null }); // checkLocationUsage
    sb.enqueue("storage_locations", { error: null }); // delete

    const deleteButton = container.querySelector(
      `button[aria-label="${i18n.t("common:delete")}"]`,
    ) as HTMLButtonElement;
    fireEvent.click(deleteButton);

    // NOTE: この削除成功パスでは waitFor がイベントループを専有しハングするため手動ポーリングする
    for (let i = 0; i < 20 && queryByText("空の棚") !== null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(queryByText("空の棚")).toBeNull();
  });

  test("画像ファイル選択でプレビューされ、削除でクリアされる", async () => {
    const onPendingFileChange = mock(() => {});
    const { container } = renderForm({ onPendingFileChange });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(10)], "photo.png", { type: "image/png" });
    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(onPendingFileChange).toHaveBeenCalledWith(file));

    // プレビュー画像が表示され、削除ボタンが出る
    await waitFor(() =>
      expect(container.querySelector("svg.lucide-trash-2")?.closest("button")).not.toBeNull(),
    );

    fireEvent.click(
      container.querySelector("svg.lucide-trash-2")?.closest("button") as HTMLElement,
    );
    await waitFor(() => expect(onPendingFileChange).toHaveBeenCalledWith(null));
  });

  test("isSubmitting 中は送信ボタンが無効", () => {
    const { container } = renderForm({ isSubmitting: true, submitLabel: "登録" });

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toContain("登録");
  });
});
