import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import { usePullToRefresh } from "./usePullToRefresh";

interface HarnessProps {
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
}

const Harness = ({ onRefresh, disabled }: HarnessProps) => {
  const { containerRef, pullDistance, isRefreshing } = usePullToRefresh({ onRefresh, disabled });
  return (
    <div ref={containerRef} data-testid="c">
      <span data-testid="pull">{pullDistance}</span>
      <span data-testid="refreshing">{String(isRefreshing)}</span>
    </div>
  );
};

const touch = (clientX: number, clientY: number) => ({ touches: [{ clientX, clientY }] });

describe("usePullToRefresh", () => {
  test("閾値以上引っ張って離すと onRefresh が呼ばれる", async () => {
    const onRefresh = mock(() => Promise.resolve());
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId("c");
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(0, 200));
    expect(Number(getByTestId("pull").textContent)).toBeGreaterThanOrEqual(64);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(getByTestId("pull").textContent).toBe("0");
    expect(getByTestId("refreshing").textContent).toBe("false");
  });

  test("閾値未満では onRefresh は呼ばれず元に戻る", () => {
    const onRefresh = mock(() => Promise.resolve());
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId("c");
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(0, 40));
    fireEvent.touchEnd(el);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(getByTestId("pull").textContent).toBe("0");
  });

  test("touchcancel では更新せず元に戻る", () => {
    const onRefresh = mock(() => Promise.resolve());
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId("c");
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(0, 200));
    fireEvent.touchCancel(el);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(getByTestId("pull").textContent).toBe("0");
  });

  test("横方向の移動ではプルしない", () => {
    const onRefresh = mock(() => Promise.resolve());
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId("c");
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(200, 20));
    expect(getByTestId("pull").textContent).toBe("0");
  });

  test("引っ張り中に disabled になるとプル量が 0 に戻る", () => {
    const onRefresh = mock(() => Promise.resolve());
    const { getByTestId, rerender } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId("c");
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(0, 100));
    expect(Number(getByTestId("pull").textContent)).toBeGreaterThan(0);
    rerender(<Harness onRefresh={onRefresh} disabled />);
    expect(getByTestId("pull").textContent).toBe("0");
  });

  test("disabled 中はジェスチャを無視する", () => {
    const onRefresh = mock(() => Promise.resolve());
    const { getByTestId } = render(<Harness onRefresh={onRefresh} disabled />);
    const el = getByTestId("c");
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(0, 200));
    fireEvent.touchEnd(el);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(getByTestId("pull").textContent).toBe("0");
  });
});
