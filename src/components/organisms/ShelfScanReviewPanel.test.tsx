import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { ShelfScanReviewPanel } from "./ShelfScanReviewPanel";

const stubToast: ToastContextValue = { toasts: [], toast: () => "toast-id", dismiss: () => {} };

const makeWrapper = (children: ReactNode) => () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{children}</> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>
          <RouterProvider router={router} />
        </ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

const renderPanel = async (props: Parameters<typeof ShelfScanReviewPanel>[0]) => {
  const Wrapper = makeWrapper(<ShelfScanReviewPanel {...props} />);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Wrapper />);
  });
  return result;
};

describe("ShelfScanReviewPanel", () => {
  afterEach(() => {
    mock.restore();
  });

  test("両方の候補が空の場合はそれぞれの空状態メッセージを表示する", async () => {
    const { getByText } = await renderPanel({ possiblyConsumed: [], possiblyUnregistered: [] });

    expect(getByText(i18n.t("possiblyConsumedEmpty", { ns: "shelfScan" }))).toBeDefined();
    expect(getByText(i18n.t("possiblyUnregisteredEmpty", { ns: "shelfScan" }))).toBeDefined();
  });

  test("食べきった？候補を一覧表示し、チェックするまで一括ボタンは無効", async () => {
    const { getByText, getByRole } = await renderPanel({
      possiblyConsumed: [
        { id: "1", name: "牛乳" },
        { id: "2", name: "卵" },
      ],
      possiblyUnregistered: [],
    });

    expect(getByText("牛乳")).toBeDefined();
    expect(getByText("卵")).toBeDefined();

    const bulkButton = getByRole("button", {
      name: i18n.t("markConsumed", { ns: "shelfScan", count: 0 }),
    }) as HTMLButtonElement;
    expect(bulkButton.disabled).toBe(true);
  });

  test("チェックして一括ボタンを押すと、選択したIDでuseBulkItemActionのconsumeが呼ばれ、一覧から消える", async () => {
    const mutateAsyncMock = mock(() => Promise.resolve({ action: "consume", count: 1 }));
    spyOn(useItemsModule, "useBulkItemAction").mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useBulkItemAction>);

    const { getByText, getByRole, queryByText } = await renderPanel({
      possiblyConsumed: [
        { id: "1", name: "牛乳" },
        { id: "2", name: "卵" },
      ],
      possiblyUnregistered: [],
    });

    const milkCheckbox = getByText("牛乳").closest("label")?.querySelector("input");
    if (!milkCheckbox) throw new Error("checkbox not found");
    fireEvent.click(milkCheckbox);

    const bulkButton = getByRole("button", {
      name: i18n.t("markConsumed", { ns: "shelfScan", count: 1 }),
    });
    await act(async () => {
      fireEvent.click(bulkButton);
      await Promise.resolve();
    });

    expect(mutateAsyncMock).toHaveBeenCalledWith({ action: "consume", ids: ["1"] });
    await waitFor(() => expect(queryByText("牛乳")).toBeNull());
    // 未選択だった「卵」は一覧に残ったまま。
    expect(getByText("卵")).toBeDefined();
  });

  test("すべて選択を押すと表示中の食べきった？候補が全選択される", async () => {
    const mutateAsyncMock = mock(() => Promise.resolve({ action: "consume", count: 2 }));
    spyOn(useItemsModule, "useBulkItemAction").mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useBulkItemAction>);

    const { getByRole } = await renderPanel({
      possiblyConsumed: [
        { id: "1", name: "牛乳" },
        { id: "2", name: "卵" },
      ],
      possiblyUnregistered: [],
    });

    const selectAllCheckbox = getByRole("checkbox", {
      name: i18n.t("selectAll", { ns: "shelfScan" }),
    });
    fireEvent.click(selectAllCheckbox);

    const bulkButton = getByRole("button", {
      name: i18n.t("markConsumed", { ns: "shelfScan", count: 2 }),
    }) as HTMLButtonElement;
    expect(bulkButton.disabled).toBe(false);
  });

  test("未登録候補を一覧表示し、新規登録ボタンが認識名をprefillNameとして引き継ぐ/items/newへのリンクになっている (#1027)", async () => {
    const { getByText, getByRole } = await renderPanel({
      possiblyConsumed: [],
      possiblyUnregistered: ["醤油"],
    });

    expect(getByText("醤油")).toBeDefined();
    const registerLink = getByRole("link", {
      name: i18n.t("registerNew", { ns: "shelfScan" }),
    });
    const href = registerLink.getAttribute("href");
    expect(href).toStartWith("/items/new?");
    expect(new URLSearchParams(href?.split("?")[1]).get("prefillName")).toBe("醤油");
  });
});
