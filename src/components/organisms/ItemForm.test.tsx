import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useCustomUnitsModule from "@/hooks/useCustomUnits";
import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useSuggestedLocationModule from "@/hooks/useSuggestedLocation";
import i18n from "@/lib/i18n";
import { loadItemFormDraft, saveItemFormDraft } from "@/lib/itemFormDraft";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// NewItemPage.test.tsx uses module mocks for ItemForm. Restore them before this
// file dynamically imports the real component so test-file discovery order
// cannot leak the stub into these tests.
mock.restore();
const { ItemForm } = await import("./ItemForm");

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
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
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

describe("ItemForm — 期限種別セレクタ (#714)", () => {
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
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
  });

  it("デフォルトでは未設定が選択されている", () => {
    const { getByRole } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );
    expect(
      getByRole("button", { name: i18n.t("items:expiryTypeUnset") }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("賞味期限を選んで送信するとonSubmitにexpiry_type: 'best_before'が渡る", () => {
    const onSubmit = spyOn({ onSubmit: () => {} }, "onSubmit");
    const { container, getByRole } = render(
      <ItemForm onSubmit={onSubmit} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("items:expiryTypeBestBefore") }));

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ expiry_type: "best_before" }));
  });

  it("既存アイテム編集時はdefaultValues.expiry_typeが反映される", () => {
    const { getByRole } = render(
      <ItemForm
        onSubmit={() => {}}
        defaultValues={{ name: "テスト", units: 1, expiry_type: "use_by" }}
      />,
      { wrapper },
    );
    expect(
      getByRole("button", { name: i18n.t("items:expiryTypeUseBy") }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("ItemForm — 店舗名 (#697)", () => {
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
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: ["○○スーパー", "△△マート"],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
  });

  it("入力した店舗名がonSubmitに渡る", async () => {
    const user = userEvent.setup();
    const onSubmit = spyOn({ onSubmit: () => {} }, "onSubmit");
    const { container } = render(
      <ItemForm onSubmit={onSubmit} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );

    const storeNameInput = container.querySelector("#store_name") as HTMLInputElement;
    await user.type(storeNameInput, "○○スーパー");

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ store_name: "○○スーパー" }));
  });

  it("空欄で送信するとstore_nameはnullになる", () => {
    const onSubmit = spyOn({ onSubmit: () => {} }, "onSubmit");
    const { container } = render(
      <ItemForm onSubmit={onSubmit} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ store_name: null }));
  });

  it("useStoreNameSuggestionsの候補がdatalistのoptionとして表示される", () => {
    const { container } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );
    const datalist = container.querySelector("#store-name-suggestions") as HTMLDataListElement;
    const optionValues = [...datalist.querySelectorAll("option")].map((o) => o.value);
    expect(optionValues).toEqual(["○○スーパー", "△△マート"]);
  });

  it("既存アイテム編集時はdefaultValues.store_nameが反映される", () => {
    const { container } = render(
      <ItemForm
        onSubmit={() => {}}
        defaultValues={{ name: "テスト", units: 1, store_name: "△△マート" }}
      />,
      { wrapper },
    );
    const storeNameInput = container.querySelector("#store_name") as HTMLInputElement;
    expect(storeNameInput.value).toBe("△△マート");
  });
});

describe("ItemForm — 内包量ロック (#742)", () => {
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
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
  });

  it("disableContentAmount=trueの場合、内包量inputがdisabledになりヒント文言が表示される", () => {
    const { container, getByText } = render(
      <ItemForm
        onSubmit={() => {}}
        defaultValues={{ name: "テスト", units: 1, content_amount: 1000 }}
        disableContentAmount
      />,
      { wrapper },
    );

    const contentAmountInput = container.querySelector("#content_amount") as HTMLInputElement;
    expect(contentAmountInput.disabled).toBe(true);
    expect(contentAmountInput.getAttribute("aria-describedby")).toBe("content-amount-locked-hint");
    expect(getByText(i18n.t("items:contentAmountLockedHint"))).toBeTruthy();
  });

  it("disableContentAmountを渡さない場合は編集可能で、ヒント文言も表示されない", () => {
    const { container, queryByText } = render(
      <ItemForm
        onSubmit={() => {}}
        defaultValues={{ name: "テスト", units: 1, content_amount: 1000 }}
      />,
      { wrapper },
    );

    const contentAmountInput = container.querySelector("#content_amount") as HTMLInputElement;
    expect(contentAmountInput.disabled).toBe(false);
    expect(queryByText(i18n.t("items:contentAmountLockedHint"))).toBeNull();
  });

  it("disabled中でも既存のcontent_amountの値はonSubmitにそのまま渡る", () => {
    const onSubmit = spyOn({ onSubmit: () => {} }, "onSubmit");
    const { container } = render(
      <ItemForm
        onSubmit={onSubmit}
        defaultValues={{ name: "テスト", units: 1, content_amount: 1000 }}
        disableContentAmount
      />,
      { wrapper },
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ content_amount: 1000 }));
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
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
  });

  afterEach(() => {
    localStorage.clear();
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
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

describe("ItemForm — 保管場所クイック追加時のpin座標クリア (#861)", () => {
  beforeEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [{ id: "loc-old", name: "旧保管場所", icon: null, photo_url: null }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useCustomUnitsModule, "useCustomUnits").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useCustomUnitsModule.useCustomUnits>);
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
    spyOn(useMasterDataModule, "useCreateStorageLocation").mockReturnValue({
      mutateAsync: async ({ name }: { name: string }) => ({
        id: "loc-new",
        name,
        icon: null,
        photo_url: null,
      }),
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateStorageLocation>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
    spyOn(useMasterDataModule, "useCreateStorageLocation").mockRestore();
  });

  it("保管場所をその場で新規作成すると、既存のpin_x/pin_yがクリアされる", async () => {
    const user = userEvent.setup();
    const handleSubmit = mock(() => {});
    const { container } = render(
      <ItemForm
        onSubmit={handleSubmit}
        defaultValues={{
          name: "既存アイテム",
          storage_location_id: "loc-old",
          pin_x: 0.3,
          pin_y: 0.4,
        }}
      />,
      { wrapper },
    );

    const trigger = container.querySelector("#storage_location_id") as HTMLButtonElement;
    await user.click(trigger);

    const addButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(i18n.t("items:addStorageLocation")),
    ) as HTMLButtonElement;
    await user.click(addButton);

    const nameInput = container.querySelector(
      'input[placeholder="' + i18n.t("items:addStorageLocation") + '"]',
    ) as HTMLInputElement;
    await user.type(nameInput, "新しい保管場所");

    const confirmButton = container.querySelector(
      `button[aria-label="${i18n.t("common:confirm")}"]`,
    ) as HTMLButtonElement;
    await user.click(confirmButton);

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submitted = handleSubmit.mock.calls[0]?.[0] as { pin_x: unknown; pin_y: unknown };
    expect(submitted.pin_x).toBeNull();
    expect(submitted.pin_y).toBeNull();
  });
});

describe("ItemForm — 保管場所の自動サジェスト (#814)", () => {
  beforeEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [
        { id: "loc-fridge", name: "冷蔵庫", icon: null, photo_url: null },
        { id: "loc-pantry", name: "パントリー", icon: null, photo_url: null },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useCustomUnitsModule, "useCustomUnits").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useCustomUnitsModule.useCustomUnits>);
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
    spyOn(useSuggestedLocationModule, "useSuggestedLocation").mockReturnValue({
      data: "loc-fridge",
      isLoading: false,
    } as unknown as ReturnType<typeof useSuggestedLocationModule.useSuggestedLocation>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
    spyOn(useSuggestedLocationModule, "useSuggestedLocation").mockRestore();
  });

  it("enableLocationSuggestion=trueかつ保管場所未選択なら、サジェストされた保管場所を事前選択しヒントを表示する", () => {
    const { container, getByText } = render(
      <ItemForm onSubmit={() => {}} enableLocationSuggestion defaultValues={{ name: "牛乳" }} />,
      { wrapper },
    );
    const trigger = container.querySelector("#storage_location_id") as HTMLButtonElement;
    expect(trigger.textContent).toContain("冷蔵庫");
    expect(getByText(i18n.t("items:suggestedLocationHint"))).toBeDefined();
  });

  it("enableLocationSuggestion=falseなら、サジェストを事前選択しない", () => {
    const { container, queryByText } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "牛乳" }} />,
      { wrapper },
    );
    const trigger = container.querySelector("#storage_location_id") as HTMLButtonElement;
    expect(trigger.textContent).not.toContain("冷蔵庫");
    expect(queryByText(i18n.t("items:suggestedLocationHint"))).toBeNull();
  });

  it("既にdefaultValuesで保管場所が指定されている場合は、サジェストで上書きしない", () => {
    const { container, queryByText } = render(
      <ItemForm
        onSubmit={() => {}}
        enableLocationSuggestion
        defaultValues={{ name: "牛乳", storage_location_id: "loc-pantry" }}
      />,
      { wrapper },
    );
    const trigger = container.querySelector("#storage_location_id") as HTMLButtonElement;
    expect(trigger.textContent).toContain("パントリー");
    expect(queryByText(i18n.t("items:suggestedLocationHint"))).toBeNull();
  });

  it("ユーザーが手動で保管場所を選択すると、サジェストのヒントは消え送信値も手動選択が使われる", async () => {
    const user = userEvent.setup();
    const handleSubmit = mock(() => {});
    const { container, queryByText } = render(
      <ItemForm
        onSubmit={handleSubmit}
        enableLocationSuggestion
        defaultValues={{ name: "牛乳" }}
      />,
      { wrapper },
    );

    const trigger = container.querySelector("#storage_location_id") as HTMLButtonElement;
    await user.click(trigger);
    const pantryOption = Array.from(container.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes("パントリー"),
    ) as HTMLElement;
    await user.click(pantryOption);

    expect(queryByText(i18n.t("items:suggestedLocationHint"))).toBeNull();
    expect(trigger.textContent).toContain("パントリー");

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submitted = handleSubmit.mock.calls[0]?.[0] as { storage_location_id: unknown };
    expect(submitted.storage_location_id).toBe("loc-pantry");
  });

  it("送信時、サジェストされた値がまだ未確定でもstorage_location_idとして送信される", () => {
    const handleSubmit = mock(() => {});
    const { container } = render(
      <ItemForm
        onSubmit={handleSubmit}
        enableLocationSuggestion
        defaultValues={{ name: "牛乳" }}
      />,
      { wrapper },
    );
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submitted = handleSubmit.mock.calls[0]?.[0] as { storage_location_id: unknown };
    expect(submitted.storage_location_id).toBe("loc-fridge");
  });
});

describe("ItemForm — アイテム種別（食料品 / 日用品）", () => {
  const categories = [
    {
      id: "cat-food",
      user_id: "u1",
      name: "食品",
      kind: "food" as const,
      created_at: "",
      updated_at: "",
    },
    {
      id: "cat-goods",
      user_id: "u1",
      name: "洗剤",
      kind: "daily_goods" as const,
      created_at: "",
      updated_at: "",
    },
  ];

  beforeEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: categories,
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
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
  });

  afterEach(() => {
    spyOn(useMasterDataModule, "useCategories").mockRestore();
    spyOn(useMasterDataModule, "useStorageLocations").mockRestore();
    spyOn(useCustomUnitsModule, "useCustomUnits").mockRestore();
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockRestore();
  });

  it("既定は食料品で、期限日と期限種別の入力欄が表示される", () => {
    const { container, getByRole } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "テスト", units: 1 }} />,
      { wrapper },
    );
    expect(
      getByRole("button", { name: i18n.t("items:itemTypeFood") }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelector("#expiry_date")).not.toBeNull();
    expect(getByRole("button", { name: i18n.t("items:expiryTypeUnset") })).toBeDefined();
  });

  it("日用品を選ぶと期限日・期限種別の入力欄が消える（購入日は残る）", () => {
    const { container, getByRole, queryByRole } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "洗剤", units: 1 }} />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }));

    expect(container.querySelector("#expiry_date")).toBeNull();
    expect(queryByRole("button", { name: i18n.t("items:expiryTypeUnset") })).toBeNull();
    expect(container.querySelector("#purchase_date")).not.toBeNull();
  });

  it("日用品で送信すると expiry_date / expiry_type が空で送られる（隠れた期限を残さない）", () => {
    const onSubmit = spyOn({ onSubmit: () => {} }, "onSubmit");
    const { container, getByRole } = render(
      <ItemForm
        onSubmit={onSubmit}
        defaultValues={{
          name: "洗剤",
          units: 1,
          expiry_date: "2030-01-01",
          expiry_type: "best_before",
        }}
      />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }));
    fireEvent.submit(container.querySelector("form")!);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        item_type: "daily_goods",
        expiry_date: undefined,
        expiry_type: null,
      }),
    );
  });

  /** QuickAddSelect はネイティブ select ではないため、トリガーを開いて
   *  オプションのボタンをクリックする。 */
  const pickCategory = async (
    user: ReturnType<typeof userEvent.setup>,
    container: HTMLElement,
    label: string,
  ) => {
    await user.click(container.querySelector("#category_id") as HTMLButtonElement);
    const option = Array.from(container.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes(label),
    ) as HTMLElement;
    await user.click(option);
  };

  it("種別を手で触っていない間はカテゴリの既定に追従する", async () => {
    const user = userEvent.setup();
    const { container, getByRole } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "洗剤", units: 1 }} />,
      { wrapper },
    );

    await pickCategory(user, container, "洗剤");

    expect(
      getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(container.querySelector("#expiry_date")).toBeNull();
  });

  it("一度手で種別を選んだらカテゴリを変えても追従しない", async () => {
    const user = userEvent.setup();
    const { container, getByRole } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "ラップ", units: 1 }} />,
      { wrapper },
    );

    fireEvent.click(getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }));
    await pickCategory(user, container, "食品");

    expect(
      getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  it("種別を明示せずカテゴリ経由で日用品になった状態でカテゴリを追加しても、新カテゴリは食料品になる", async () => {
    const addCategory = mock(async () => ({ id: "cat-new", name: "調味料" }));
    const createSpy = spyOn(useMasterDataModule, "useCreateCategory").mockReturnValue({
      mutateAsync: addCategory,
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateCategory>);
    const user = userEvent.setup();
    const { container } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "しょうゆ", units: 1 }} />,
      { wrapper },
    );

    // 「洗剤」(daily_goods) を選ぶと実効種別は日用品になるが、明示指定はしていない
    await pickCategory(user, container, "洗剤");
    await user.click(container.querySelector("#category_id") as HTMLButtonElement);
    const addButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(i18n.t("items:addCategory")),
    ) as HTMLButtonElement;
    await user.click(addButton);
    await user.type(
      container.querySelector(
        'input[placeholder="' + i18n.t("items:addCategory") + '"]',
      ) as HTMLInputElement,
      "調味料",
    );
    await user.click(
      container.querySelector(
        `button[aria-label="${i18n.t("common:confirm")}"]`,
      ) as HTMLButtonElement,
    );

    expect(addCategory).toHaveBeenCalledWith({ name: "調味料", kind: "food" });
    createSpy.mockRestore();
  });

  it("種別を明示的に日用品にしてからカテゴリを追加すると、新カテゴリも日用品になる", async () => {
    const addCategory = mock(async () => ({ id: "cat-new", name: "掃除用品" }));
    const createSpy = spyOn(useMasterDataModule, "useCreateCategory").mockReturnValue({
      mutateAsync: addCategory,
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateCategory>);
    const user = userEvent.setup();
    const { container, getByRole } = render(
      <ItemForm onSubmit={() => {}} defaultValues={{ name: "スポンジ", units: 1 }} />,
      { wrapper },
    );

    await user.click(getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }));
    await user.click(container.querySelector("#category_id") as HTMLButtonElement);
    const addButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(i18n.t("items:addCategory")),
    ) as HTMLButtonElement;
    await user.click(addButton);
    await user.type(
      container.querySelector(
        'input[placeholder="' + i18n.t("items:addCategory") + '"]',
      ) as HTMLInputElement,
      "掃除用品",
    );
    await user.click(
      container.querySelector(
        `button[aria-label="${i18n.t("common:confirm")}"]`,
      ) as HTMLButtonElement,
    );

    expect(addCategory).toHaveBeenCalledWith({ name: "掃除用品", kind: "daily_goods" });
    createSpy.mockRestore();
  });

  it("既存アイテム編集時は defaultValues.item_type が反映される", () => {
    const { getByRole } = render(
      <ItemForm
        onSubmit={() => {}}
        defaultValues={{ name: "洗剤", units: 1, item_type: "daily_goods" }}
      />,
      { wrapper },
    );
    expect(
      getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
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
