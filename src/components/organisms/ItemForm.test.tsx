import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useCustomUnitsModule from "@/hooks/useCustomUnits";
import * as useMasterDataModule from "@/hooks/useMasterData";
import i18n from "@/lib/i18n";
import { loadItemFormDraft, saveItemFormDraft } from "@/lib/itemFormDraft";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { ItemForm } from "./ItemForm";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

describe("ItemForm — aria-describedby / aria-invalid (#621)", () => {
  beforeEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useCustomUnitsModule, "useCustomUnits").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useCustomUnitsModule.useCustomUnits>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
  });

  it("名前が未入力で送信するとaria-invalid/aria-describedbyがエラー文言のidを指す", () => {
    const { container } = render(<ItemForm onSubmit={() => {}} />, { wrapper });
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const nameInput = container.querySelector("#name") as HTMLInputElement;
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = nameInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("name-error");
    const errorEl = container.querySelector(`#${describedBy}`);
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).not.toBe("");
  });

  it("個数が0の状態で送信するとunitsフィールドがaria-invalidになる", () => {
    const { container } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "テスト", units: 0 }} />,
      { wrapper },
    );
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const unitsInput = container.querySelector("#units") as HTMLInputElement;
    expect(unitsInput.getAttribute("aria-invalid")).toBe("true");
    expect(unitsInput.getAttribute("aria-describedby")).toBe("units-error");
  });

  it("エラーがない場合はaria-invalidがfalseでaria-describedbyは付与されない（minimum_stock）", () => {
    const { container } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );
    const minStockInput = container.querySelector("#minimum_stock") as HTMLInputElement;
    expect(minStockInput.getAttribute("aria-invalid")).toBe("false");
    // help textのみを指し、エラーidは含まれない
    expect(minStockInput.getAttribute("aria-describedby")).toBe("minimum-stock-help");
  });

  it("バーコード欄が空の状態でEnterキーを押してもフォームは送信されない（#656）", () => {
    const onSubmit = spyOn({ onSubmit: () => {} }, "onSubmit");
    const { container } = render(<ItemForm onSubmit={onSubmit} />, { wrapper });

    const barcodeInput = container.querySelector("#barcode") as HTMLInputElement;
    expect(barcodeInput.value).toBe("");
    fireEvent.keyDown(barcodeInput, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ItemForm — 下書き保存/復元 (#672)", () => {
  beforeEach(() => {
    localStorage.clear();
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useCustomUnitsModule, "useCustomUnits").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useCustomUnitsModule.useCustomUnits>);
  });

  afterEach(() => {
    localStorage.clear();
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
  });

  it("draftKey未指定の場合は下書きバナーが表示されない", () => {
    saveItemFormDraft("new-item", {
      values: { ...emptyValues(), name: "下書き商品" },
      unitsRaw: "1",
      contentAmountRaw: "1",
    });
    const { container } = render(<ItemForm onSubmit={() => {}} />, { wrapper });
    expect(container.textContent).not.toContain(i18n.t("items:draftRestorePrompt"));
  });

  it("draftKey指定時、入力後しばらくするとlocalStorageに下書き保存される", async () => {
    const user = userEvent.setup();
    const { container } = render(<ItemForm onSubmit={() => {}} draftKey="new-item" />, {
      wrapper,
    });
    const nameInput = container.querySelector("#name") as HTMLInputElement;
    await user.type(nameInput, "下書き商品");

    await new Promise((resolve) => setTimeout(resolve, 700));

    const draft = loadItemFormDraft("new-item");
    expect(draft?.payload.values.name).toBe("下書き商品");
  });

  it("既存の下書きがある場合、マウント時に復元バナーが表示される", () => {
    saveItemFormDraft("new-item", {
      values: { ...emptyValues(), name: "下書き商品" },
      unitsRaw: "3",
      contentAmountRaw: "2",
    });
    const { container } = render(<ItemForm onSubmit={() => {}} draftKey="new-item" />, {
      wrapper,
    });

    expect(container.textContent).toContain(i18n.t("items:draftRestorePrompt"));
    // 復元前はまだ空のまま
    const nameInput = container.querySelector("#name") as HTMLInputElement;
    expect(nameInput.value).toBe("");
  });

  it("「復元する」を押すとフォームに下書きの値が反映され、バナーが消える", () => {
    saveItemFormDraft("new-item", {
      values: { ...emptyValues(), name: "下書き商品" },
      unitsRaw: "3",
      contentAmountRaw: "2",
    });
    const { container } = render(<ItemForm onSubmit={() => {}} draftKey="new-item" />, {
      wrapper,
    });

    const restoreButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(i18n.t("items:draftRestore")),
    ) as HTMLButtonElement;
    fireEvent.click(restoreButton);

    const nameInput = container.querySelector("#name") as HTMLInputElement;
    expect(nameInput.value).toBe("下書き商品");
    const unitsInput = container.querySelector("#units") as HTMLInputElement;
    expect(unitsInput.value).toBe("3");
    expect(container.textContent).not.toContain(i18n.t("items:draftRestorePrompt"));
  });

  it("「破棄する」を押すとlocalStorageの下書きが削除され、バナーが消える", () => {
    saveItemFormDraft("new-item", {
      values: { ...emptyValues(), name: "下書き商品" },
      unitsRaw: "1",
      contentAmountRaw: "1",
    });
    const { container } = render(<ItemForm onSubmit={() => {}} draftKey="new-item" />, {
      wrapper,
    });

    const discardButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(i18n.t("items:draftDiscard")),
    ) as HTMLButtonElement;
    fireEvent.click(discardButton);

    expect(loadItemFormDraft("new-item")).toBeNull();
    const nameInput = container.querySelector("#name") as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(container.textContent).not.toContain(i18n.t("items:draftRestorePrompt"));
  });
});

const emptyValues = () => ({
  name: "",
  barcode: "",
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: "",
  expiry_date: "",
  notes: "",
  image_path: "",
  minimum_stock: null,
  unit_price: null,
  auto_reorder: false,
  reorder_threshold: null,
  pin_x: null,
  pin_y: null,
});
