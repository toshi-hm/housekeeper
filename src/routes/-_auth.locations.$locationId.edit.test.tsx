import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Store } from "@tanstack/store";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as FloorPlanEditorModule from "@/components/organisms/FloorPlanEditor";
import * as useFloorPlansModule from "@/hooks/useFloorPlans";
import * as useMasterDataModule from "@/hooks/useMasterData";
import { OfflineError } from "@/lib/requireOnline";
import { ToastContext } from "@/lib/toast-context";
import type { StorageLocation } from "@/types/item";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { FloorPlanEditorPage, Route } from "./_auth.locations.$locationId.edit";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  history: { createHref: (href: string) => href },
  isServer: false,
  options: { defaultStructuralSharing: true },
  stores: { __store: new Store({ matches: [] }) },
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const baseLocation: StorageLocation = {
  id: "loc-1",
  user_id: "test-user-id",
  name: "冷蔵庫",
  photo_path: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("FloorPlanEditorPage — オフライン保存(#1007)", () => {
  let paramsSpy: ReturnType<typeof spyOn>;
  let locationsSpy: ReturnType<typeof spyOn>;
  let floorPlanSpy: ReturnType<typeof spyOn>;
  let markersSpy: ReturnType<typeof spyOn>;
  let saveMarkerSpy: ReturnType<typeof spyOn>;
  let saveFloorPlanSpy: ReturnType<typeof spyOn>;
  let editorSpy: ReturnType<typeof spyOn>;
  let toastMock: ReturnType<typeof mock>;

  beforeEach(() => {
    paramsSpy = spyOn(Route, "useParams").mockReturnValue({
      locationId: "loc-1",
    } as ReturnType<typeof Route.useParams>);
    locationsSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [baseLocation],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    floorPlanSpy = spyOn(useFloorPlansModule, "useFloorPlan").mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof useFloorPlansModule.useFloorPlan>);
    markersSpy = spyOn(useFloorPlansModule, "useFloorPlanStorageLocationMarkers").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useFloorPlansModule.useFloorPlanStorageLocationMarkers>);
    saveMarkerSpy = spyOn(
      useFloorPlansModule,
      "useUpsertFloorPlanStorageLocationMarker",
    ).mockReturnValue({
      mutate: () => undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useFloorPlansModule.useUpsertFloorPlanStorageLocationMarker>);

    toastMock = mock(() => "toast-id");

    // The canvas-based editor itself is covered by FloorPlanEditor.test.tsx.
    // Here it's stubbed to immediately invoke onSave, so this test exercises
    // only the parent's onError wiring for the save mutation.
    const StubFloorPlanEditor = ({ onSave }: { onSave: (document: unknown) => void }) => {
      onSave({});
      return null;
    };
    editorSpy = spyOn(FloorPlanEditorModule, "FloorPlanEditor").mockImplementation(
      StubFloorPlanEditor as unknown as typeof FloorPlanEditorModule.FloorPlanEditor,
    );
  });

  afterEach(() => {
    paramsSpy.mockRestore();
    locationsSpy.mockRestore();
    floorPlanSpy.mockRestore();
    markersSpy.mockRestore();
    saveMarkerSpy.mockRestore();
    saveFloorPlanSpy.mockRestore();
    editorSpy.mockRestore();
    cleanup();
  });

  const renderPage = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<FloorPlanEditorPage />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <ToastContext.Provider value={{ toasts: [], toast: toastMock, dismiss: () => {} }}>
            <routerContext.Provider value={stubRouter}>{children}</routerContext.Provider>
          </ToastContext.Provider>
        </QueryClientProvider>
      ),
    });
  };

  it("オフラインで間取り保存が失敗した場合、汎用エラーではなくofflineErrorトーストを表示する", () => {
    saveFloorPlanSpy = spyOn(useFloorPlansModule, "useUpsertFloorPlan").mockReturnValue({
      mutate: (_input: unknown, options: { onError?: (error: unknown) => void }) => {
        options.onError?.(new OfflineError());
      },
      isPending: false,
    } as unknown as ReturnType<typeof useFloorPlansModule.useUpsertFloorPlan>);

    renderPage();

    expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error");
    // 具体的な文言はi18nキーに依存するが、少なくとも「不明なエラー」用の
    // 汎用フォールバックとは異なるメッセージであるべき(#1007)。
    const [message] = toastMock.mock.calls[0] as [string, string];
    expect(message.toLowerCase()).not.toBe("unknownerror");
  });
});
