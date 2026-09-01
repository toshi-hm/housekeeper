import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { Item } from "@/types/item";

import { FloorPlanViewer } from "./FloorPlanViewer";

const document = {
  schemaVersion: 1 as const,
  units: "cm" as const,
  width: 100,
  height: 100,
  gridSize: 10,
  walls: [],
  shapes: [],
};

describe("FloorPlanViewer", () => {
  it("renders the fallback list and opens an item from it", () => {
    const onItemClick = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer
          document={document}
          items={[]}
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

  it("renders storage-location markers and opens the selected location", () => {
    const onStorageLocationClick = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer
          document={document}
          storageLocations={[
            {
              id: "location-1",
              user_id: "user-1",
              name: "Kitchen",
              photo_path: null,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]}
          storageLocationMarkers={[
            {
              id: "marker-1",
              user_id: "user-1",
              floor_plan_id: "plan-1",
              storage_location_id: "location-1",
              object_id: null,
              x: 30,
              y: 40,
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

    const locationButtons = getByRole("list", {
      name: /Storage locations|間取り上の保管場所/,
    }).querySelectorAll("button");
    const locationButton = locationButtons[0];
    if (!locationButton) throw new Error("Expected a storage location button");
    fireEvent.click(locationButton);
    expect(onStorageLocationClick).toHaveBeenCalledWith("location-1");
  });

  it("既存のマーカーや配置済みアイテムのクリックをキャンバス配置へ伝播させない", () => {
    const onCanvasClick = mock(() => undefined);
    const onStorageLocationClick = mock(() => undefined);
    const onItemClick = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer
          document={document}
          storageLocations={[
            {
              id: "location-1",
              user_id: "user-1",
              name: "Kitchen",
              photo_path: null,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]}
          storageLocationMarkers={[
            {
              id: "marker-1",
              user_id: "user-1",
              floor_plan_id: "plan-1",
              storage_location_id: "location-1",
              object_id: null,
              x: 30,
              y: 40,
              z: 0,
              rotation: 0,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]}
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
          items={[{ id: "item-1", name: "Rice" } as Item]}
          onCanvasClick={onCanvasClick}
          onStorageLocationClick={onStorageLocationClick}
          onItemClick={onItemClick}
        />
      </I18nextProvider>,
    );

    const canvas = getByRole("img");
    const kitchenButton = canvas.querySelector<SVGGElement>(
      '[role="button"][aria-label="Kitchen"]',
    );
    const riceButton = canvas.querySelector<SVGGElement>('[role="button"][aria-label="Rice"]');

    if (!kitchenButton || !riceButton) {
      throw new Error("Floor plan interactive elements were not rendered");
    }

    fireEvent.click(kitchenButton);
    fireEvent.click(riceButton);

    expect(onStorageLocationClick).toHaveBeenCalledWith("location-1");
    expect(onItemClick).toHaveBeenCalledWith("item-1");
    expect(onCanvasClick).not.toHaveBeenCalled();
  });

  it("配置解除ボタンをクリックするとonRemovePlacementに配置IDを渡す", () => {
    const onRemovePlacement = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer
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
          onRemovePlacement={onRemovePlacement}
        />
      </I18nextProvider>,
    );

    const removeButton = getByRole("button", { name: /配置を解除|Remove Rice/ });
    fireEvent.click(removeButton);
    expect(onRemovePlacement).toHaveBeenCalledWith("placement-1");
  });

  it("onRemovePlacementが未指定の場合、配置解除ボタンを表示しない", () => {
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer
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
        />
      </I18nextProvider>,
    );

    const itemList = getByRole("list", { name: /配置した在庫|placed on the floor plan/ });
    expect(itemList.querySelectorAll("button")).toHaveLength(1);
  });

  it("在庫が選択されている間はキャンバスがキーボード操作可能になり、矢印キー+Enterで配置できる(#916)", () => {
    const onCanvasClick = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer
          document={document}
          items={[{ id: "item-1", name: "Rice" } as Item]}
          unplacedItems={[{ id: "item-1", name: "Rice" } as Item]}
          pendingItemId="item-1"
          onSelectItemForPlacement={() => undefined}
          onCanvasClick={onCanvasClick}
        />
      </I18nextProvider>,
    );

    const canvas = getByRole("application");
    expect(canvas.getAttribute("tabindex")).toBe("0");

    // Grid is 100x100 with a 10-unit step, so the cursor starts centered at
    // (50, 50). ArrowRight moves it one grid step right before Enter
    // confirms the placement at the cursor's position.
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    fireEvent.keyDown(canvas, { key: "Enter" });

    expect(onCanvasClick).toHaveBeenCalledWith({ x: 60, y: 50 });
  });

  it("キーボード配置モードでない場合、キャンバスはimgロールのままキー操作を無視する", () => {
    const onCanvasClick = mock(() => undefined);
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanViewer document={document} onCanvasClick={onCanvasClick} />
      </I18nextProvider>,
    );

    const canvas = getByRole("img");
    expect(canvas.getAttribute("tabindex")).toBeNull();
    fireEvent.keyDown(canvas, { key: "Enter" });
    expect(onCanvasClick).not.toHaveBeenCalled();
  });
});
