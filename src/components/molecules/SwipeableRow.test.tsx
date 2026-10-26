import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

import { SwipeableRow } from "./SwipeableRow";

const touch = (x: number, y = 0) => ({ touches: [{ clientX: x, clientY: y }] });

const swipe = (el: HTMLElement, from: number, to: number) => {
  fireEvent.touchStart(el, touch(from));
  fireEvent.touchMove(el, touch((from + to) / 2, 1));
  fireEvent.touchMove(el, touch(to, 2));
  fireEvent.touchEnd(el);
};

const setup = (props: Partial<Parameters<typeof SwipeableRow>[0]> = {}) => {
  const onLeft = mock(() => {});
  const onRight = mock(() => {});
  const onClick = mock(() => {});
  const view = render(
    <SwipeableRow
      leftAction={{ label: "削除", onTrigger: onLeft }}
      rightAction={{ label: "購入", onTrigger: onRight }}
      {...props}
    >
      <button onClick={onClick}>row</button>
    </SwipeableRow>,
  );
  return {
    onLeft,
    onRight,
    onClick,
    view,
    el: view.getByText("row").parentElement as HTMLElement,
  };
};

describe("SwipeableRow", () => {
  it("triggers the left action after a long left swipe", () => {
    const { onLeft, onRight, el } = setup();
    swipe(el, 200, 100);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();
  });

  it("triggers the right action after a long right swipe", () => {
    const { onLeft, onRight, el } = setup();
    swipe(el, 100, 200);
    expect(onRight).toHaveBeenCalledTimes(1);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("does not trigger when the swipe is shorter than the threshold", () => {
    const { onLeft, onRight, el } = setup();
    swipe(el, 200, 170);
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("ignores mostly-vertical gestures (page scroll)", () => {
    const { onLeft, el } = setup();
    fireEvent.touchStart(el, touch(200, 0));
    fireEvent.touchMove(el, touch(160, 120));
    fireEvent.touchEnd(el);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("does not move toward a direction without an action", () => {
    const { onRight, el } = setup({ leftAction: undefined });
    fireEvent.touchStart(el, touch(200));
    fireEvent.touchMove(el, touch(100, 1));
    fireEvent.touchMove(el, touch(60, 2));
    fireEvent.touchEnd(el);
    expect(onRight).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("translateX(0px)");
  });

  it("shows the action background while dragging and resets afterwards", () => {
    const { el, view } = setup();
    fireEvent.touchStart(el, touch(200));
    fireEvent.touchMove(el, touch(150, 1));
    fireEvent.touchMove(el, touch(120, 2));
    expect(view.getByTestId("swipe-action-background").textContent).toContain("削除");
    fireEvent.touchEnd(el);
    expect(view.queryByTestId("swipe-action-background")).toBeNull();
  });

  it("swallows the click that follows a swipe but not a plain tap", () => {
    const { onClick, el, view } = setup();
    swipe(el, 200, 100);
    fireEvent.click(view.getByText("row"));
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.touchStart(el, touch(200));
    fireEvent.touchEnd(el);
    fireEvent.click(view.getByText("row"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders plain children without gesture handling when disabled", () => {
    const { onLeft, el } = setup({ disabled: true });
    swipe(el, 200, 100);
    expect(onLeft).not.toHaveBeenCalled();
  });
});
