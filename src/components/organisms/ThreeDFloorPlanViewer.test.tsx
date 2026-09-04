import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import * as webglModule from "@/lib/webgl";
import type { Item, StorageLocation } from "@/types/item";

import { ThreeDFloorPlanViewer } from "./ThreeDFloorPlanViewer";

const document = {
  schemaVersion: 1 as const,
  units: "cm" as const,
  width: 100,
  height: 100,
  gridSize: 10,
  walls: [],
  shapes: [],
};

describe("ThreeDFloorPlanViewer", () => {
  it("renders the placed-items list and opens an item from it", () => {
    const onItemClick = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ThreeDFloorPlanViewer
          document={document}
          items={[{ id: "item-1", name: "Rice" } as Item]}
          placements={[
            {
              id: "placement-1",
              user_id: "user-1",
              floor_plan_id: "plan-1",
              item_id: "item-1",
              object_id: null,
              x: 20,
              y: 20,
              z: 0,
              rotation: 0,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]}
          onItemClick={onItemClick}
        />
      </I18nextProvider>,
    );
    const itemList = getByRole("list", { name: /配置した在庫|placed on the floor plan/ });
    const itemButton = itemList.querySelector("button");
    if (!itemButton) throw new Error("Expected a placed item button");
    fireEvent.click(itemButton);
    expect(onItemClick).toHaveBeenCalledWith("item-1");
  });

  it("renders the storage-location list and opens a location from it (#988)", () => {
    const onStorageLocationClick = mock(() => undefined);
    const location: StorageLocation = {
      id: "loc-1",
      user_id: "user-1",
      name: "冷蔵庫",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ThreeDFloorPlanViewer
          document={document}
          storageLocations={[location]}
          storageLocationMarkers={[
            {
              id: "marker-1",
              user_id: "user-1",
              floor_plan_id: "plan-1",
              storage_location_id: "loc-1",
              object_id: null,
              x: 10,
              y: 10,
              z: 0,
              rotation: 0,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]}
          onStorageLocationClick={onStorageLocationClick}
        />
      </I18nextProvider>,
    );
    const locationList = getByRole("list", {
      name: /間取り上の保管場所|Storage locations on the floor plan/,
    });
    const locationButton = locationList.querySelector("button");
    if (!locationButton) throw new Error("Expected a storage-location button");
    fireEvent.click(locationButton);
    expect(onStorageLocationClick).toHaveBeenCalledWith("loc-1");
  });

  it("renders nothing for the placed-items list when there are no placements", () => {
    const { queryByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ThreeDFloorPlanViewer document={document} />
      </I18nextProvider>,
    );
    expect(queryByRole("list", { name: /配置した在庫|placed on the floor plan/ })).toBeNull();
  });

  describe("WebGL initialization failure (#919)", () => {
    let webglSpy: ReturnType<typeof spyOn> | undefined;

    afterEach(() => {
      webglSpy?.mockRestore();
      webglSpy = undefined;
    });

    it("does not mount the 3D canvas and calls onWebglUnavailable when WebGL is unsupported", () => {
      // happy-dom (this test environment) has no WebGL support by default, so
      // isWebglAvailable() already returns false here without any mocking —
      // this exercises the real "unsupported" path end to end.
      const onWebglUnavailable = mock(() => undefined);
      const { container, getByText } = render(
        <I18nextProvider i18n={i18n}>
          <ThreeDFloorPlanViewer document={document} onWebglUnavailable={onWebglUnavailable} />
        </I18nextProvider>,
      );

      expect(onWebglUnavailable).toHaveBeenCalledTimes(1);
      expect(container.querySelector("canvas")).toBeNull();
      expect(getByText(/3D表示を利用できないため|3D is unavailable/)).toBeDefined();
    });

    it("mounts the 3D canvas and does not call onWebglUnavailable when WebGL is supported", () => {
      webglSpy = spyOn(webglModule, "isWebglAvailable").mockReturnValue(true);
      const onWebglUnavailable = mock(() => undefined);
      const { container } = render(
        <I18nextProvider i18n={i18n}>
          <ThreeDFloorPlanViewer document={document} onWebglUnavailable={onWebglUnavailable} />
        </I18nextProvider>,
      );

      expect(onWebglUnavailable).not.toHaveBeenCalled();
      expect(container.querySelector("canvas")).not.toBeNull();
    });
  });
});
