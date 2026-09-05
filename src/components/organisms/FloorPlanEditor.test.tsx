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

  it("選択中の図形を矢印キーでグリッド1マス分移動できる (#870)", () => {
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

    const shapeGroup = container.querySelector("g rect")?.parentElement;
    // pointerdown selects without moving (no pointermove), leaving the
    // shape at its committed position but focused for keyboard input.
    fireEvent.pointerDown(shapeGroup as Element, { clientX: 70, clientY: 75, pointerId: 7 });
    fireEvent.pointerUp(svg, { clientX: 70, clientY: 75, pointerId: 7 });

    fireEvent.keyDown(svg, { key: "ArrowRight" });

    const rect = container.querySelector("g rect");
    expect(rect?.getAttribute("x")).toBe(String(50 + initialDocument.gridSize));
    expect(rect?.getAttribute("y")).toBe("60");

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        shapes: [
          expect.objectContaining({ id: "shape-1", x: 50 + initialDocument.gridSize, y: 60 }),
        ],
      }),
    );
  });

  it("選択中の壁を矢印キーで移動すると両端が同じ量だけ動く (#870)", () => {
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
    fireEvent.pointerDown(line as Element, { clientX: 10, clientY: 10, pointerId: 8 });
    fireEvent.pointerUp(svg, { clientX: 10, clientY: 10, pointerId: 8 });

    fireEvent.keyDown(svg, { key: "ArrowDown" });

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        walls: [
          expect.objectContaining({
            id: "wall-1",
            start: { x: 10, y: 10 + initialDocument.gridSize },
            end: { x: 110, y: 10 + initialDocument.gridSize },
          }),
        ],
      }),
    );
  });

  it("壁要素はTab移動可能でEnterキーのみで選択・矢印キーで移動できる (#987)", () => {
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
    expect(line?.getAttribute("tabindex")).toBe("0");
    expect(line?.getAttribute("role")).toBe("button");

    // No pointer interaction at all: focus reaches the wall via Tab order
    // (tabIndex=0) and Enter selects it, matching keyboard-only usage.
    fireEvent.keyDown(line as Element, { key: "Enter" });
    fireEvent.keyDown(svg, { key: "ArrowDown" });

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        walls: [
          expect.objectContaining({
            id: "wall-1",
            start: { x: 10, y: 10 + initialDocument.gridSize },
            end: { x: 110, y: 10 + initialDocument.gridSize },
          }),
        ],
      }),
    );
  });

  it("図形要素はTab移動可能でSpaceキーのみで選択・矢印キーで移動できる (#987)", () => {
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

    const shapeGroup = container.querySelector("g rect")?.parentElement;
    expect(shapeGroup).not.toBeNull();
    expect(shapeGroup?.getAttribute("tabindex")).toBe("0");
    expect(shapeGroup?.getAttribute("role")).toBe("button");

    fireEvent.keyDown(shapeGroup as Element, { key: " " });
    fireEvent.keyDown(svg, { key: "ArrowRight" });

    const rect = container.querySelector("g rect");
    expect(rect?.getAttribute("x")).toBe(String(50 + initialDocument.gridSize));
    expect(rect?.getAttribute("y")).toBe("60");

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        shapes: [
          expect.objectContaining({ id: "shape-1", x: 50 + initialDocument.gridSize, y: 60 }),
        ],
      }),
    );
  });

  it("線ツール選択中はポインタ操作なしで矢印キー+Enterのみで壁を新規作成できる (#987)", () => {
    const onSave = mock(() => undefined);
    const { getByRole, container } = render(
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

    // Center of the 600x400 canvas is (300, 200); moving the keyboard
    // cursor left by one grid step (10) lands it at (290, 200) before any
    // start point exists — the crosshair should reflect that.
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    const cursorLine = container.querySelector('[data-testid="floor-plan-keyboard-cursor"] line');
    expect(cursorLine?.getAttribute("x1")).toBe("280");

    fireEvent.keyDown(svg, { key: "Enter" });
    expect(container.querySelector('[data-testid="floor-plan-keyboard-cursor"]')).toBeNull();

    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "Enter" });

    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        walls: [expect.objectContaining({ start: { x: 290, y: 200 }, end: { x: 300, y: 200 } })],
      }),
    );
  });

  it("矩形ツール選択中はポインタ操作なしで矢印キー+Enterのみで図形を新規作成できる (#987)", () => {
    const onSave = mock(() => undefined);
    const { getByRole, container } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanEditor initialDocument={createEmptyFloorPlanDocument()} onSave={onSave} />
      </I18nextProvider>,
    );
    const svg = getByRole("application");
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    });
    fireEvent.click(getByRole("button", { name: i18n.t("common:mapToolRectangle") }));

    fireEvent.keyDown(svg, { key: "ArrowUp" });
    fireEvent.keyDown(svg, { key: "Enter" });
    fireEvent.keyDown(svg, { key: "ArrowDown" });
    fireEvent.keyDown(svg, { key: "ArrowDown" });
    fireEvent.keyDown(svg, { key: "Enter" });

    expect(container.querySelector('[data-testid="floor-plan-drawing-preview"]')).toBeNull();
    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        shapes: [
          expect.objectContaining({ x: 300, y: 190, width: 0, height: 20, kind: "rectangle" }),
        ],
      }),
    );
  });

  it("壁を選択した後に線ツールへ切り替えると、矢印キーは既存の壁ではなく新規作成用カーソルを動かす (PR #996 review)", () => {
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

    // Select the wall (leaves state.selectedId set — switching tools below
    // does not clear it, since `select` is a separate action from `setTool`).
    const line = container.querySelector("line");
    fireEvent.keyDown(line as Element, { key: "Enter" });

    // Switch to the wall-drawing tool without clearing the selection first.
    fireEvent.click(getByRole("button", { name: i18n.t("common:mapToolWall") }));
    fireEvent.keyDown(svg, { key: "ArrowRight" });

    // The keyboard-only drawing cursor should appear (arrow keys move it)…
    expect(container.querySelector('[data-testid="floor-plan-keyboard-cursor"]')).not.toBeNull();
    // …and the still-selected wall must NOT have been nudged.
    fireEvent.click(getByRole("button", { name: i18n.t("common:save") }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        walls: [
          expect.objectContaining({
            id: "wall-1",
            start: { x: 10, y: 10 },
            end: { x: 110, y: 10 },
          }),
        ],
      }),
    );
  });

  it("同種の壁・図形が複数あってもそれぞれ一意なアクセシブルネームを持つ (PR #996 review)", () => {
    const onSave = mock(() => undefined);
    const initialDocument = {
      ...createEmptyFloorPlanDocument(),
      walls: [
        { id: "wall-1", start: { x: 10, y: 10 }, end: { x: 110, y: 10 }, thickness: 8 },
        { id: "wall-2", start: { x: 10, y: 50 }, end: { x: 110, y: 50 }, thickness: 8 },
      ],
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
        {
          id: "shape-2",
          kind: "rectangle" as const,
          x: 150,
          y: 60,
          width: 40,
          height: 30,
          rotation: 0,
          label: null,
        },
      ],
    };
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <FloorPlanEditor initialDocument={initialDocument} onSave={onSave} />
      </I18nextProvider>,
    );

    const wallLabel = i18n.t("common:mapToolWall");
    const rectangleLabel = i18n.t("common:mapToolRectangle");
    // Each element gets an index-qualified name distinct from its siblings
    // and from the (identically-labeled) toolbar buttons.
    expect(getByRole("button", { name: `${wallLabel} 1` })).not.toBeNull();
    expect(getByRole("button", { name: `${wallLabel} 2` })).not.toBeNull();
    expect(getByRole("button", { name: `${rectangleLabel} 1` })).not.toBeNull();
    expect(getByRole("button", { name: `${rectangleLabel} 2` })).not.toBeNull();
  });
});
