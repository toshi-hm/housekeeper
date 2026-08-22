import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { Item } from "@/types/item";

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

  it("renders nothing for the placed-items list when there are no placements", () => {
    const { queryByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ThreeDFloorPlanViewer document={document} />
      </I18nextProvider>,
    );
    expect(queryByRole("list", { name: /配置した在庫|placed on the floor plan/ })).toBeNull();
  });
});
