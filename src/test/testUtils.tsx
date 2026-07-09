import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue, type ToastVariant } from "@/lib/toast-context";
import type { Item, ItemLot } from "@/types/item";

interface RecordedToast {
  message: string;
  variant: ToastVariant | undefined;
}

/**
 * renderHook / render 用の共通ラッパー。
 * QueryClientProvider + I18nextProvider + ToastContext を提供し、
 * toast 呼び出しを記録して検証できるようにする。
 */
export const createHookWrapper = (queryClient?: QueryClient) => {
  const qc =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  const toastCalls: RecordedToast[] = [];
  const toastValue: ToastContextValue = {
    toasts: [],
    toast: (message, variant) => {
      toastCalls.push({ message, variant });
    },
    dismiss: () => {},
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={toastValue}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
  return { wrapper, queryClient: qc, toastCalls };
};

export const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "テストアイテム",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  notes: null,
  image_path: null,
  minimum_stock: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

export const makeLot = (overrides: Partial<ItemLot> = {}): ItemLot => ({
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  item_id: "33333333-3333-4333-8333-333333333333",
  units: 1,
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});
