import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useConsumptionLogsModule from "@/hooks/useConsumptionLogs";
import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as exportLib from "@/lib/export";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item } from "@/types/item";

import { DataExportPanel } from "./DataExportPanel";

const toastMock = mock<(message: string, variant?: "success" | "error") => void>(() => {});

const wrapper = ({ children }: { children: ReactNode }) => {
  const stubToast: ToastContextValue = { toasts: [], toast: toastMock, dismiss: () => {} };
  return (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
    </I18nextProvider>
  );
};

const item: Item = {
  id: "item-1",
  user_id: "user-1",
  name: "牛乳",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1000,
  content_unit: "mL",
  opened_remaining: null,
  purchase_date: "2026-07-01",
  expiry_date: "2026-07-15",
  notes: null,
  image_path: null,
  minimum_stock: null,
  deleted_at: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

describe("DataExportPanel", () => {
  let downloadSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    toastMock.mockClear();

    spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [item],
    } as unknown as ReturnType<typeof useItemsModule.useItems>);
    spyOn(useItemsModule, "useItemsForExport").mockReturnValue({
      data: [{ id: "item-1", name: "牛乳", category_id: null, notes: null, content_unit: "mL" }],
    } as unknown as ReturnType<typeof useItemsModule.useItemsForExport>);
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useConsumptionLogsModule, "useAllConsumptionLogs").mockReturnValue({
      data: [
        {
          item_id: "item-1",
          delta_amount: 100,
          delta_unit: "mL",
          occurred_at: "2026-07-10T00:00:00Z",
        },
      ],
    } as unknown as ReturnType<typeof useConsumptionLogsModule.useAllConsumptionLogs>);
    spyOn(useItemLotsModule, "useAllItemLots").mockReturnValue({
      data: [{ item_id: "item-1", units: 1, purchase_date: "2026-07-01" }],
    } as unknown as ReturnType<typeof useItemLotsModule.useAllItemLots>);

    downloadSpy = spyOn(exportLib, "downloadTextFile").mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();
  });

  it("clicking the items CSV button downloads a CSV file and shows a success toast", () => {
    const { getAllByRole } = render(<DataExportPanel />, { wrapper });
    const csvButtons = getAllByRole("button", { name: /CSV/i });
    fireEvent.click(csvButtons[0] as HTMLElement);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [content, filename, mimeType] = downloadSpy.mock.calls[0] as [string, string, string];
    expect(content).toContain("名前");
    expect(filename).toMatch(/^items-\d{8}\.csv$/);
    expect(mimeType).toContain("text/csv");
    expect(toastMock).toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("clicking the items JSON button downloads a JSON backup file", () => {
    const { getByRole } = render(<DataExportPanel />, { wrapper });
    fireEvent.click(getByRole("button", { name: /JSON/i }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [content, filename, mimeType] = downloadSpy.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { version: number; items: Item[] };
    expect(parsed.version).toBe(1);
    expect(parsed.items).toHaveLength(1);
    expect(filename).toMatch(/^items-\d{8}\.json$/);
    expect(mimeType).toBe("application/json");
  });

  it("clicking the history CSV button includes both consumption and purchase rows by default", () => {
    const { getAllByRole } = render(<DataExportPanel />, { wrapper });
    const historyButton = getAllByRole("button", { name: /CSV/i })[1] as HTMLElement;
    fireEvent.click(historyButton);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [content, filename] = downloadSpy.mock.calls[0] as [string, string];
    expect(content).toContain("消費");
    expect(content).toContain("購入");
    expect(filename).toMatch(/^history-\d{8}\.csv$/);
  });

  it("switching the history target to consumption-only excludes purchase rows", () => {
    const { getAllByRole, getByLabelText } = render(<DataExportPanel />, { wrapper });
    const targetSelect = getByLabelText(/対象|Target/i);
    fireEvent.change(targetSelect, { target: { value: "consumption" } });

    const historyButton = getAllByRole("button", { name: /CSV/i })[1] as HTMLElement;
    fireEvent.click(historyButton);

    const [content] = downloadSpy.mock.calls[0] as [string];
    expect(content).toContain("消費");
    expect(content).not.toContain("購入");
  });
});
