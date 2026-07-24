import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useCustomUnitsModule from "@/hooks/useCustomUnits";
import * as useMasterDataModule from "@/hooks/useMasterData";
import i18n from "@/lib/i18n";
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
});
