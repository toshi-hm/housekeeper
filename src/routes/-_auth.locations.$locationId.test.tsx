import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Store } from "@tanstack/store";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import * as useItemsModule from "@/hooks/useItems";
import * as useLocationPhotoModule from "@/hooks/useLocationPhoto";
import * as useMasterDataModule from "@/hooks/useMasterData";
import type { Item, StorageLocation } from "@/types/item";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside LocationMapPage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { LocationMapPage, Route } from "./_auth.locations.$locationId";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: { defaultStructuralSharing: true },
  stores: { __store: new Store({ matches: [] }) },
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <routerContext.Provider value={stubRouter}>{children}</routerContext.Provider>
    </QueryClientProvider>
  );
};

const baseLocation: StorageLocation = {
  id: "loc-1",
  user_id: "test-user-id",
  name: "冷蔵庫",
  photo_path: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseItem: Item = {
  id: "item-1",
  user_id: "test-user-id",
  name: "テスト商品",
  barcode: null,
  category_id: null,
  storage_location_id: "loc-1",
  units: 1,
  content_amount: null,
  content_unit: null,
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  image_path: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
};

const renderPage = () => render(<LocationMapPage />, { wrapper: Wrapper as React.ComponentType });

describe("LocationMapPage", () => {
  let paramsspy: ReturnType<typeof spyOn>;
  let locationsspy: ReturnType<typeof spyOn>;
  let itemsspy: ReturnType<typeof spyOn>;
  let photospy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    paramsspy = spyOn(Route, "useParams").mockReturnValue({
      locationId: "loc-1",
    } as ReturnType<typeof Route.useParams>);

    locationsspy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [baseLocation],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    itemsspy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [baseItem],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemsModule.useItems>);

    photospy = spyOn(useLocationPhotoModule, "useSignedLocationPhoto").mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useLocationPhotoModule.useSignedLocationPhoto>);
  });

  afterEach(() => {
    paramsspy.mockRestore();
    locationsspy.mockRestore();
    itemsspy.mockRestore();
    photospy.mockRestore();
    cleanup();
  });

  it("shows spinner while locations are loading", () => {
    locationsspy.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const { getByRole } = renderPage();
    expect(getByRole("status")).toBeDefined();
  });

  it("shows spinner while items are loading", () => {
    itemsspy.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useItemsModule.useItems>);
    const { getByRole } = renderPage();
    expect(getByRole("status")).toBeDefined();
  });

  it("shows error message when the storage locations query fails", () => {
    locationsspy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const { getByText, queryByRole } = renderPage();
    expect(
      getByText(/storageLocationMapLoadError|Failed to load the storage map|収納マップの読み込み/),
    ).toBeDefined();
    expect(queryByRole("status")).toBeNull();
  });

  it("shows error message when the items query fails", () => {
    itemsspy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useItemsModule.useItems>);
    const { getByText, queryByRole } = renderPage();
    expect(
      getByText(/storageLocationMapLoadError|Failed to load the storage map|収納マップの読み込み/),
    ).toBeDefined();
    expect(queryByRole("status")).toBeNull();
  });

  it("does not show the error state when both queries succeed", () => {
    const { queryByText } = renderPage();
    expect(
      queryByText(
        /storageLocationMapLoadError|Failed to load the storage map|収納マップの読み込み/,
      ),
    ).toBeNull();
  });
});
