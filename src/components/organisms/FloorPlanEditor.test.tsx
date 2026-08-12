import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { createEmptyFloorPlanDocument } from "@/types/floorPlan";

import { FloorPlanEditor } from "./FloorPlanEditor";

describe("FloorPlanEditor", () => {
  it("ドラッグ中は線のプレビューを表示し、同じツールで連続して確定できる", () => {
    const onSave = mock(() => undefined);
    const { getByRole, queryByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanEditor initialDocument={createEmptyFloorPlanDocument()} onSave={onSave} />
      </I18nextProvider>,
    );
    const svg = getByRole("application");
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    });
    fireEvent.click(getByRole("button", { name: i18n.t("common:mapToolWall") }));

    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 200, pointerId: 1 });

    const preview = getByRole("application").querySelector(
      '[data-testid="floor-plan-drawing-preview"] line',
    );
    expect(preview?.getAttribute("x1")).toBe("100");
    expect(preview?.getAttribute("y1")).toBe("100");
    expect(preview?.getAttribute("x2")).toBe("300");
    expect(preview?.getAttribute("y2")).toBe("200");

    fireEvent.pointerUp(svg, { clientX: 300, clientY: 200, pointerId: 1 });
    expect(queryByTestId("floor-plan-drawing-preview")).toBeNull();

    fireEvent.pointerDown(svg, { clientX: 200, clientY: 300, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 400, clientY: 300, pointerId: 2 });

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        walls: [
          expect.objectContaining({
            start: { x: 100, y: 100 },
            end: { x: 300, y: 200 },
          }),
          expect.objectContaining({
            start: { x: 200, y: 300 },
            end: { x: 400, y: 300 },
          }),
        ],
      }),
    );
  });
});
