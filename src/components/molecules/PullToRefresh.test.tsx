import { act, fireEvent, render } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { PullToRefresh } from "./PullToRefresh";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const setScrollY = (value: number) => {
  Object.defineProperty(window, "scrollY", { value, configurable: true, writable: true });
};

const touch = (y: number, x = 0) => ({ touches: [{ clientX: x, clientY: y }] });

const pull = (el: HTMLElement, distance: number) => {
  fireEvent.touchStart(el, touch(0));
  fireEvent.touchMove(el, touch(distance / 2));
  fireEvent.touchMove(el, touch(distance));
};

describe("PullToRefresh", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
    setScrollY(0);
  });
  afterAll(async () => {
    await i18n.changeLanguage("ja");
  });

  const setup = (onRefresh = mock(() => Promise.resolve()), disabled = false) => {
    const view = render(
      <PullToRefresh onRefresh={onRefresh} disabled={disabled}>
        <p>content</p>
      </PullToRefresh>,
      { wrapper },
    );
    return { onRefresh, view, el: view.getByText("content").parentElement as HTMLElement };
  };

  it("renders its children", () => {
    const { view } = setup();
    expect(view.getByText("content")).toBeTruthy();
  });

  it("calls onRefresh when pulled past the threshold and released", async () => {
    const { onRefresh, el } = setup();
    pull(el, 200);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not call onRefresh when the touch is cancelled", async () => {
    const { onRefresh, el } = setup();
    pull(el, 200);
    await act(async () => {
      fireEvent.touchCancel(el);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("shows the release hint once pulled far enough", () => {
    const { view, el } = setup();
    pull(el, 40);
    expect(view.getByTestId("pull-to-refresh-indicator").textContent).toContain("引っ張って更新");
    pull(el, 300);
    expect(view.getByTestId("pull-to-refresh-indicator").textContent).toContain("離して更新");
  });

  it("does not refresh on a short pull", async () => {
    const { onRefresh, el } = setup();
    pull(el, 40);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not start when the page is scrolled down", async () => {
    setScrollY(120);
    const { onRefresh, el } = setup();
    pull(el, 300);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores horizontal drags", async () => {
    const { onRefresh, el } = setup();
    fireEvent.touchStart(el, touch(0, 0));
    fireEvent.touchMove(el, touch(10, 200));
    fireEvent.touchMove(el, touch(80, 400));
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    const { onRefresh, el } = setup(
      mock(() => Promise.resolve()),
      true,
    );
    pull(el, 300);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("shows the refreshing state until onRefresh settles", async () => {
    let resolve!: () => void;
    const onRefresh = mock(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const { view, el } = setup(onRefresh);
    pull(el, 300);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(view.getByTestId("pull-to-refresh-indicator").textContent).toContain("更新中");
    await act(async () => {
      resolve();
    });
    expect(view.getByTestId("pull-to-refresh-indicator").textContent).toBe("");
  });

  it("recovers when onRefresh rejects", async () => {
    const onRefresh = mock(() => Promise.reject(new Error("boom")));
    const { view, el } = setup(onRefresh);
    pull(el, 300);
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(view.getByTestId("pull-to-refresh-indicator").textContent).toBe("");
  });
});
