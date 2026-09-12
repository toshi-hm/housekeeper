import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import * as pwaModule from "@/lib/pwa";
import type { Item } from "@/types/item";

import { useAppBadge } from "./useAppBadge";

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "牛乳",
  units: 1,
  content_amount: 1,
  content_unit: "個",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const mockDeps = ({
  items,
  categories = [],
  expiryWarningDays,
}: {
  items: Item[];
  categories?: { id: string; kind?: "food" | "daily_goods" }[];
  expiryWarningDays?: number;
}) => {
  spyOn(useItemsModule, "useItems").mockReturnValue({
    data: items,
  } as unknown as ReturnType<typeof useItemsModule.useItems>);
  spyOn(useMasterDataModule, "useCategories").mockReturnValue({
    data: categories,
  } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
  spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
    data: expiryWarningDays !== undefined ? { expiry_warning_days: expiryWarningDays } : undefined,
  } as unknown as ReturnType<typeof useUserSettingsModule.useUserSettings>);
};

describe("useAppBadge", () => {
  afterEach(() => {
    mock.restore();
  });

  test("期限切れ/期限接近の在庫ありアイテムだけをバッジ件数に含める", async () => {
    const badgeSpy = spyOn(pwaModule, "updateAppBadge").mockResolvedValue(undefined);
    mockDeps({
      items: [
        makeItem({ id: "expired", units: 1, expiry_date: "2020-01-01" }),
        makeItem({ id: "no-stock-expired", units: 0, expiry_date: "2020-01-01" }),
        makeItem({ id: "ok", units: 1, expiry_date: "2099-01-01" }),
      ],
    });

    renderHook(() => useAppBadge());

    await waitFor(() => expect(badgeSpy).toHaveBeenCalledWith(1));
  });

  test("日用品へ切り替え済みカテゴリのアイテムは、残った古いexpiry_dateをバッジ件数から除外する (#937相当)", async () => {
    const badgeSpy = spyOn(pwaModule, "updateAppBadge").mockResolvedValue(undefined);
    mockDeps({
      items: [
        makeItem({
          id: "stale-expiry-daily-goods",
          units: 1,
          category_id: "cat-daily",
          expiry_date: "2020-01-01",
        }),
      ],
      categories: [{ id: "cat-daily", kind: "daily_goods" }],
    });

    renderHook(() => useAppBadge());

    await waitFor(() => expect(badgeSpy).toHaveBeenCalledWith(0));
  });
});
