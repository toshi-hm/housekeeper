import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { useOfflineActionQueue } from "@/hooks/useOfflineActionQueue";
import i18n from "@/lib/i18n";
import { readOfflineActionQueue } from "@/lib/offlineActionQueue";
import { ConcurrentUpdateError, OfflineError } from "@/lib/requireOnline";
import {
  ToastContext,
  type ToastContextValue,
  type ToastOptions,
  type ToastVariant,
} from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";
import type { PurchaseInput, UpsertShoppingItemInput } from "@/types/shopping";

interface ToastCall {
  message: string;
  variant?: ToastVariant;
  options?: ToastOptions;
}

const makeWrapper = (toastCalls: ToastCall[]) => {
  const toast = mock((message: string, variant?: ToastVariant, options?: ToastOptions) => {
    toastCalls.push({ message, variant, options });
    return `toast-${toastCalls.length}`;
  });
  const dismiss = mock(() => {});
  const value: ToastContextValue = { toasts: [], toast, dismiss };
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(I18nextProvider, { i18n }, createElement(ToastContext, { value }, children));
  return { Wrapper, toast };
};

const makeFormValues = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  name: "テスト商品",
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
  ...overrides,
});

const purchaseInput = (id: string): PurchaseInput => ({
  shoppingItemId: id,
  itemValues: makeFormValues({ name: id }),
  applyMergeFields: false,
});

const addAlertInput = (id: string): UpsertShoppingItemInput => ({
  name: id,
  linked_item_id: id,
});

const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
};

describe("useOfflineActionQueue", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setOnline(true);
  });

  test("オンライン時はそのまま実行し、実行結果を status: sent で返す", async () => {
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls);
    const purchase = mock(async () => ({ id: "created-item" }));
    const addAlert = mock(async () => ({ id: "shopping-1" }));

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.queuePurchase(purchaseInput("s1"));
    });

    expect(purchase).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: "sent", result: { id: "created-item" } });
    expect(readOfflineActionQueue()).toHaveLength(0);
  });

  test("オフライン時はpurchaseを呼ばずにキューへ積み、status: queued を返す", async () => {
    setOnline(false);
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls);
    const purchase = mock(async () => ({ id: "created-item" }));
    const addAlert = mock(async () => ({ id: "shopping-1" }));

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.queuePurchase(purchaseInput("s1"));
    });

    expect(purchase).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "queued" });
    const persisted = readOfflineActionQueue();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.kind).toBe("purchase");
    expect(persisted[0]?.payload).toEqual(purchaseInput("s1"));
    expect(result.current.queueLength).toBe(1);
  });

  test("オフライン時はaddAlertを呼ばずにキューへ積み、status: queued を返す", async () => {
    setOnline(false);
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls);
    const purchase = mock(async () => ({ id: "created-item" }));
    const addAlert = mock(async () => ({ id: "shopping-1" }));

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.queueAddAlert(addAlertInput("item-1"));
    });

    expect(addAlert).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "queued" });
    const persisted = readOfflineActionQueue();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.kind).toBe("add-alert");
  });

  test("オンライン判定後にOfflineErrorが投げられた場合(競合状態)もキューへ積む", async () => {
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls);
    const purchase = mock(async () => {
      throw new OfflineError();
    });
    const addAlert = mock(async () => ({ id: "shopping-1" }));

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.queuePurchase(purchaseInput("s1"));
    });

    expect(outcome).toEqual({ status: "queued" });
    expect(readOfflineActionQueue()).toHaveLength(1);
  });

  test("OfflineError以外のエラーはそのまま呼び出し元に伝播し、キューには積まない", async () => {
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls);
    const purchase = mock(async () => {
      throw new Error("boom");
    });
    const addAlert = mock(async () => ({ id: "shopping-1" }));

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    await expect(result.current.queuePurchase(purchaseInput("s1"))).rejects.toThrow("boom");
    expect(readOfflineActionQueue()).toHaveLength(0);
  });

  test("マウント時に既にオンラインでキューが残っていれば即座にリプレイする", async () => {
    // 前回セッションでオフラインのまま積まれた想定
    setOnline(false);
    const toastCalls: ToastCall[] = [];
    const { Wrapper: setupWrapper } = makeWrapper(toastCalls);
    const setupPurchase = mock(async () => ({ id: "x" }));
    const setupAddAlert = mock(async () => ({ id: "x" }));
    const { result: setupResult, unmount } = renderHook(
      () => useOfflineActionQueue({ purchase: setupPurchase, addAlert: setupAddAlert }),
      { wrapper: setupWrapper },
    );
    await act(async () => {
      await setupResult.current.queuePurchase(purchaseInput("s1"));
    });
    unmount();
    expect(readOfflineActionQueue()).toHaveLength(1);

    // オンラインに戻ってから新規マウント
    setOnline(true);
    const purchase = mock(async () => ({ id: "created-item" }));
    const addAlert = mock(async () => ({ id: "shopping-1" }));
    renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: makeWrapper(toastCalls).Wrapper,
    });

    await waitFor(() => {
      expect(purchase).toHaveBeenCalledTimes(1);
    });
    expect(purchase).toHaveBeenCalledWith(purchaseInput("s1"));
    expect(readOfflineActionQueue()).toHaveLength(0);
    await waitFor(() => {
      expect(toastCalls.some((c) => c.variant === "success")).toBe(true);
    });
  });

  test("再接続(onlineイベント)で積まれたアクションを順にリプレイし、成功したものをキューから除去する", async () => {
    setOnline(false);
    const toastCalls: ToastCall[] = [];
    const purchase = mock(async () => ({ id: "created-item" }));
    const addAlert = mock(async () => ({ id: "shopping-1" }));
    const { Wrapper } = makeWrapper(toastCalls);

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.queuePurchase(purchaseInput("s1"));
      await result.current.queueAddAlert(addAlertInput("item-1"));
    });
    expect(readOfflineActionQueue()).toHaveLength(2);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(purchase).toHaveBeenCalledTimes(1);
      expect(addAlert).toHaveBeenCalledTimes(1);
    });
    expect(purchase).toHaveBeenCalledWith(purchaseInput("s1"));
    expect(addAlert).toHaveBeenCalledWith(addAlertInput("item-1"));
    expect(readOfflineActionQueue()).toHaveLength(0);
    await waitFor(() => {
      expect(toastCalls.some((c) => c.message.includes("2"))).toBe(true);
    });
  });

  test("リプレイ中に1件がConcurrentUpdateErrorで失敗しても、そのアクションだけキューから除去し残りは継続する", async () => {
    setOnline(false);
    const toastCalls: ToastCall[] = [];
    const purchase = mock(async (input: PurchaseInput) => {
      if (input.shoppingItemId === "conflict") throw new ConcurrentUpdateError();
      return { id: "created-item" };
    });
    const addAlert = mock(async () => ({ id: "shopping-1" }));
    const { Wrapper } = makeWrapper(toastCalls);

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.queuePurchase(purchaseInput("conflict"));
      await result.current.queuePurchase(purchaseInput("ok"));
    });
    expect(readOfflineActionQueue()).toHaveLength(2);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(purchase).toHaveBeenCalledTimes(2);
    });
    // 競合した分・成功した分の両方がキューから除去され、残らない
    expect(readOfflineActionQueue()).toHaveLength(0);
  });

  test("リプレイ中に再びオフラインになった(OfflineError)場合、そのアクション以降をキューに残したままリプレイを打ち切る", async () => {
    setOnline(false);
    const toastCalls: ToastCall[] = [];
    const purchase = mock(async (input: PurchaseInput) => {
      if (input.shoppingItemId === "goes-offline") throw new OfflineError();
      return { id: "created-item" };
    });
    const addAlert = mock(async () => ({ id: "shopping-1" }));
    const { Wrapper } = makeWrapper(toastCalls);

    const { result } = renderHook(() => useOfflineActionQueue({ purchase, addAlert }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.queuePurchase(purchaseInput("goes-offline"));
      await result.current.queuePurchase(purchaseInput("never-reached"));
    });
    expect(readOfflineActionQueue()).toHaveLength(2);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // 1件目でOfflineErrorが起きたため打ち切られ、両方ともキューに残る
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(readOfflineActionQueue()).toHaveLength(2);
  });
});
