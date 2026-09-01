import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Store } from "@tanstack/store";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import * as useFloorPlansModule from "@/hooks/useFloorPlans";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import type { StorageLocation } from "@/types/item";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate/Link inside MapPage don't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { MapPage } from "./_auth.map";

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

const renderPage = () => render(<MapPage />, { wrapper: Wrapper as React.ComponentType });

describe("MapPage", () => {
  let locationsSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let floorPlanSpy: ReturnType<typeof spyOn>;
  let markersSpy: ReturnType<typeof spyOn>;
  let placementsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    locationsSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [baseLocation],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemsModule.useItems>);

    floorPlanSpy = spyOn(useFloorPlansModule, "useFloorPlan").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlan>);

    markersSpy = spyOn(useFloorPlansModule, "useFloorPlanStorageLocationMarkers").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlanStorageLocationMarkers>);

    placementsSpy = spyOn(useFloorPlansModule, "useFloorPlanPlacements").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlanPlacements>);
  });

  afterEach(() => {
    locationsSpy.mockRestore();
    itemsSpy.mockRestore();
    floorPlanSpy.mockRestore();
    markersSpy.mockRestore();
    placementsSpy.mockRestore();
    cleanup();
  });

  it("保管場所が0件のとき、保管場所作成へ誘導するEmptyStateを表示する(#916)", () => {
    locationsSpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getByRole, getByText, queryByText } = renderPage();

    expect(
      getByText(/mapNoLocationsTitle|保管場所がまだありません|No storage locations yet/),
    ).toBeDefined();
    expect(
      getByRole("button", {
        name: /mapCreateLocationCta|保管場所を作成する|Create a storage location/,
      }),
    ).toBeDefined();
    // The "no shared floor plan" fallback text belongs to the has-locations
    // branch and should not also render here.
    expect(
      queryByText(
        /mapNoSharedFloorPlan|共通の2D間取りがまだありません|No shared 2D floor plan yet/,
      ),
    ).toBeNull();
  });

  it("保管場所が存在するとき、EmptyStateの代わりに間取りセクションを表示する", () => {
    const { queryByRole, getByText } = renderPage();

    expect(
      queryByRole("button", {
        name: /mapCreateLocationCta|保管場所を作成する|Create a storage location/,
      }),
    ).toBeNull();
    expect(
      getByText(/mapNoSharedFloorPlan|共通の2D間取りがまだありません|No shared 2D floor plan yet/),
    ).toBeDefined();
  });
});
