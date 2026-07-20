import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import type { Item } from "@/types/item";

import i18n from "../../lib/i18n";
import { ItemCard } from "./ItemCard";

// テスト実行時に言語検出が非同期で確定するため、日英どちらの表示でもマッチするようにする
const QUICK_MEMO_NAME = /メモを編集|Edit memo/i;

const baseItem: Item = {
  id: "1",
  user_id: "u1",
  name: "牛乳",
  units: 2,
  content_amount: 1000,
  content_unit: "mL",
  opened_remaining: null,
  category_id: null,
  barcode: null,
  storage_location_id: null,
  expiry_date: "2099-12-31",
  purchase_date: null,
  notes: null,
  image_path: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const makeWrapper = (children: ReactNode) => () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{children}</> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>
  );
};

const renderCard = async (props: Parameters<typeof ItemCard>[0]) => {
  const Wrapper = makeWrapper(<ItemCard {...props} />);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Wrapper />);
  });
  return result;
};

describe("ItemCard", () => {
  it("shows Minus icon (no spinner) when isQuickConsuming=false", async () => {
    const { container } = await renderCard({
      item: baseItem,
      onQuickConsume: () => {},
      isQuickConsuming: false,
    });
    const spinner = container.querySelector('[role="status"]');
    expect(spinner).toBeNull();
  });

  it("shows spinner when isQuickConsuming=true", async () => {
    const { container } = await renderCard({
      item: baseItem,
      onQuickConsume: () => {},
      isQuickConsuming: true,
    });
    const spinner = container.querySelector('[role="status"]');
    expect(spinner).not.toBeNull();
  });

  it("disables quick consume button when isQuickConsuming=true", async () => {
    const { container } = await renderCard({
      item: baseItem,
      onQuickConsume: () => {},
      isQuickConsuming: true,
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it("does not show quick consume button when units=0", async () => {
    const { container } = await renderCard({
      item: { ...baseItem, units: 0 },
      onQuickConsume: () => {},
    });
    const btn = container.querySelector("button");
    expect(btn).toBeNull();
  });

  it("does not nest the quick consume button inside the card link (invalid HTML)", async () => {
    const { container } = await renderCard({
      item: baseItem,
      onQuickConsume: () => {},
    });
    const link = container.querySelector("a");
    expect(link?.querySelector("button")).toBeNull();
  });

  it("does not show the quick memo button when onQuickMemo is not provided", async () => {
    const { container } = await renderCard({ item: baseItem });
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("shows the quick memo button when onQuickMemo is provided", async () => {
    const { getByRole } = await renderCard({
      item: baseItem,
      onQuickMemo: () => {},
    });
    expect(getByRole("button", { name: QUICK_MEMO_NAME })).toBeDefined();
  });

  it("calls onQuickMemo with the item when the quick memo button is clicked", async () => {
    const onQuickMemo = mock(() => {});
    const { getByRole } = await renderCard({
      item: baseItem,
      onQuickMemo,
    });
    fireEvent.click(getByRole("button", { name: QUICK_MEMO_NAME }));
    expect(onQuickMemo).toHaveBeenCalledTimes(1);
    expect(onQuickMemo).toHaveBeenCalledWith(baseItem);
  });

  it("does not nest the quick memo button inside the card link (invalid HTML)", async () => {
    const { container } = await renderCard({
      item: baseItem,
      onQuickMemo: () => {},
    });
    const link = container.querySelector("a");
    expect(link?.querySelector("button")).toBeNull();
  });

  it("hides the quick memo button in selection mode", async () => {
    const { container } = await renderCard({
      item: baseItem,
      onQuickMemo: () => {},
      selectionMode: true,
      onToggleSelect: () => {},
    });
    expect(container.querySelector("button")).toBeNull();
  });
});
