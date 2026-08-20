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

  it("選択ツールで既存の図形をドラッグすると move-shape が発行され座標が更新される (#870)", () => {
    const onSave = mock(() => undefined);
    const initialDocument = {
      ...createEmptyFloorPlanDocument(),
      shapes: [
        {
          id: "shape-1",
          kind: "rectangle" as const,
          x: 50,
          y: 60,
          width: 40,
          height: 30,
          rotation: 0,
          label: null,
        },
      ],
    };
    const { getByRole, container } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanEditor initialDocument={initialDocument} onSave={onSave} />
      </I18nextProvider>,
    );
    const svg = getByRole("application");
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    });

    // Default tool is "select" — no need to switch tools before dragging.
    const shapeGroup = container.querySelector("g rect")?.parentElement;
    expect(shapeGroup).not.toBeNull();
    fireEvent.pointerDown(shapeGroup as Element, { clientX: 60, clientY: 70, pointerId: 5 });
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 100, pointerId: 5 });

    const rect = container.querySelector("g rect");
    expect(rect?.getAttribute("x")).toBe("80");
    expect(rect?.getAttribute("y")).toBe("90");

    fireEvent.pointerUp(svg, { clientX: 90, clientY: 100, pointerId: 5 });

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        shapes: [expect.objectContaining({ id: "shape-1", x: 80, y: 90 })],
      }),
    );
  });

  it("選択ツールで既存の壁をドラッグすると move-wall が発行され両端座標が更新される (#870)", () => {
    const onSave = mock(() => undefined);
    const initialDocument = {
      ...createEmptyFloorPlanDocument(),
      walls: [{ id: "wall-1", start: { x: 10, y: 10 }, end: { x: 110, y: 10 }, thickness: 8 }],
    };
    const { getByRole, container } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanEditor initialDocument={initialDocument} onSave={onSave} />
      </I18nextProvider>,
    );
    const svg = getByRole("application");
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    });

    const line = container.querySelector("line");
    expect(line).not.toBeNull();
    fireEvent.pointerDown(line as Element, { clientX: 10, clientY: 10, pointerId: 6 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 10, pointerId: 6 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 10, pointerId: 6 });

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        walls: [
          expect.objectContaining({
            id: "wall-1",
            start: { x: 40, y: 10 },
            end: { x: 140, y: 10 },
          }),
        ],
      }),
    );
  });
});
