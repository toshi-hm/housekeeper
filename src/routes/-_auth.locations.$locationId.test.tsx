import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Store } from "@tanstack/store";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { useEffect } from "react";

import * as ThreeDFloorPlanViewerModule from "@/components/organisms/ThreeDFloorPlanViewer";
import * as useFloorPlansModule from "@/hooks/useFloorPlans";
import * as useItemsModule from "@/hooks/useItems";
import * as useLocationPhotoModule from "@/hooks/useLocationPhoto";
import * as useMasterDataModule from "@/hooks/useMasterData";
import { ToastContext } from "@/lib/toast-context";
import type { FloorPlan, FloorPlanDocument } from "@/types/floorPlan";
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
  history: { createHref: (href: string) => href },
  isServer: false,
  options: { defaultStructuralSharing: true },
  stores: { __store: new Store({ matches: [] }) },
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast = { toasts: [], toast: () => "", dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={stubToast}>
        <routerContext.Provider value={stubRouter}>{children}</routerContext.Provider>
      </ToastContext.Provider>
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

  it("戻るボタンにaria-labelが付与されている(#862)", () => {
    const { getByRole } = renderPage();
    expect(getByRole("button", { name: /^back$|戻る|^Back$/i })).toBeDefined();
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

describe("LocationMapPage — 3D WebGL auto-fallback (#919)", () => {
  const floorPlanDocument: FloorPlanDocument = {
    schemaVersion: 1,
    units: "cm",
    width: 100,
    height: 100,
    gridSize: 10,
    walls: [],
    shapes: [],
  };

  const floorPlan: FloorPlan = {
    id: "plan-1",
    user_id: "test-user-id",
    name: "共通間取り",
    schema_version: 1,
    document: floorPlanDocument,
    revision: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  let paramsspy: ReturnType<typeof spyOn>;
  let locationsspy: ReturnType<typeof spyOn>;
  let itemsspy: ReturnType<typeof spyOn>;
  let photospy: ReturnType<typeof spyOn>;
  let floorPlanSpy: ReturnType<typeof spyOn>;
  let markersSpy: ReturnType<typeof spyOn>;
  let placementsSpy: ReturnType<typeof spyOn>;
  let upsertPlacementSpy: ReturnType<typeof spyOn>;
  let deletePlacementSpy: ReturnType<typeof spyOn>;
  let threeDViewerSpy: ReturnType<typeof spyOn>;
  let toastMock: ReturnType<typeof mock>;

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
    floorPlanSpy = spyOn(useFloorPlansModule, "useFloorPlan").mockReturnValue({
      data: floorPlan,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlan>);
    markersSpy = spyOn(useFloorPlansModule, "useFloorPlanStorageLocationMarkers").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlanStorageLocationMarkers>);
    placementsSpy = spyOn(useFloorPlansModule, "useFloorPlanPlacements").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlanPlacements>);
    upsertPlacementSpy = spyOn(useFloorPlansModule, "useUpsertFloorPlanPlacement").mockReturnValue({
      mutate: () => undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useFloorPlansModule.useUpsertFloorPlanPlacement>);
    deletePlacementSpy = spyOn(useFloorPlansModule, "useDeleteFloorPlanPlacement").mockReturnValue({
      mutate: () => undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useFloorPlansModule.useDeleteFloorPlanPlacement>);

    // ThreeDFloorPlanViewer is lazy-loaded, and WebGL-detection itself is
    // covered by ThreeDFloorPlanViewer.test.tsx. Here it's stubbed with a
    // component that immediately reports a WebGL failure, so this test
    // exercises only the parent's wiring: the 3d -> 2d tab switch + toast.
    const StubThreeDFloorPlanViewer = ({
      onWebglUnavailable,
    }: {
      onWebglUnavailable?: () => void;
    }) => {
      useEffect(() => {
        onWebglUnavailable?.();
      }, [onWebglUnavailable]);
      return null;
    };
    threeDViewerSpy = spyOn(
      ThreeDFloorPlanViewerModule,
      "ThreeDFloorPlanViewer",
    ).mockImplementation(
      StubThreeDFloorPlanViewer as typeof ThreeDFloorPlanViewerModule.ThreeDFloorPlanViewer,
    );

    toastMock = mock(() => "toast-id");
  });

  afterEach(() => {
    paramsspy.mockRestore();
    locationsspy.mockRestore();
    itemsspy.mockRestore();
    photospy.mockRestore();
    floorPlanSpy.mockRestore();
    markersSpy.mockRestore();
    placementsSpy.mockRestore();
    upsertPlacementSpy.mockRestore();
    deletePlacementSpy.mockRestore();
    threeDViewerSpy.mockRestore();
    cleanup();
  });

  // The 2D tab this test switches to also renders a router <Link> (edit/create
  // shared floor plan), which needs a more complete router stub than the
  // minimal one above (it reads router.history, router.stores.location and
  // router.buildLocation()'s return shape).
  const fakeLocationState = {
    href: "/locations/loc-1",
    pathname: "/locations/loc-1",
    search: {},
    searchStr: "",
    hash: "",
    state: {},
  };
  const stubRouterWithLink = {
    ...stubRouter,
    basepath: "",
    protocolAllowlist: ["http:", "https:"],
    buildLocation: () => ({
      href: "/locations/loc-1/edit",
      publicHref: "/locations/loc-1/edit",
      pathname: "/locations/loc-1/edit",
      search: {},
      searchStr: "",
      hash: "",
      state: {},
      external: false,
    }),
    stores: { __store: new Store({ matches: [] }), location: new Store(fakeLocationState) },
    state: { location: fakeLocationState, matches: [], pendingMatches: [] },
  } as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

  const FallbackWrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={queryClient}>
        <ToastContext.Provider value={{ toasts: [], toast: toastMock, dismiss: () => {} }}>
          <routerContext.Provider value={stubRouterWithLink}>{children}</routerContext.Provider>
        </ToastContext.Provider>
      </QueryClientProvider>
    );
  };

  it("switches from the 3D tab to the 2D tab and notifies the user when WebGL is unavailable", async () => {
    const { getByRole } = render(<LocationMapPage />, {
      wrapper: FallbackWrapper as React.ComponentType,
    });

    // Match either the raw i18n key (no I18nextProvider here — see the other
    // describe block above) or an actual translation, since whether i18next
    // has been initialized process-wide depends on test execution order.
    const tab3d = /^map3d$|3D view|3D表示/;
    const tabFloorPlan = /^mapFloorPlan$|2D floor plan|2D間取り/;

    fireEvent.click(getByRole("tab", { name: tab3d }));

    await waitFor(() => {
      expect(getByRole("tab", { name: tabFloorPlan }).getAttribute("aria-selected")).toBe("true");
    });
    expect(getByRole("tab", { name: tab3d }).getAttribute("aria-selected")).toBe("false");
    expect(toastMock).toHaveBeenCalled();
  });
});
