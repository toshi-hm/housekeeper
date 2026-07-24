import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { useState } from "react";

import { useRovingTabs } from "./useRovingTabs";

type TabId = "a" | "b" | "c";
const TABS = ["a", "b", "c"] as const satisfies readonly TabId[];

const Harness = () => {
  const [active, setActive] = useState<TabId>("a");
  const { tablistProps, getTabProps } = useRovingTabs(TABS, active, setActive);
  return (
    <div role="tablist" {...tablistProps}>
      {TABS.map((tab) => (
        <button key={tab} role="tab" aria-selected={active === tab} {...getTabProps(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
};

describe("useRovingTabs (#632)", () => {
  test("アクティブなタブのみtabIndex=0、他は-1", () => {
    const { getByText } = render(<Harness />);
    expect((getByText("a") as HTMLElement).tabIndex).toBe(0);
    expect((getByText("b") as HTMLElement).tabIndex).toBe(-1);
    expect((getByText("c") as HTMLElement).tabIndex).toBe(-1);
  });

  test("ArrowRightで次のタブに切り替わりフォーカスも移動する", async () => {
    const { getByText, container } = render(<Harness />);
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: "ArrowRight" });
    expect(getByText("b").getAttribute("aria-selected")).toBe("true");
  });

  test("末尾でArrowRightを押すと先頭に循環する", () => {
    const { getByText, container } = render(<Harness />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(getByText("c").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(getByText("a").getAttribute("aria-selected")).toBe("true");
  });

  test("先頭でArrowLeftを押すと末尾に循環する", () => {
    const { getByText, container } = render(<Harness />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(getByText("c").getAttribute("aria-selected")).toBe("true");
  });

  test("Endで末尾のタブに、Homeで先頭のタブに移動する", () => {
    const { getByText, container } = render(<Harness />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: "End" });
    expect(getByText("c").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(getByText("a").getAttribute("aria-selected")).toBe("true");
  });

  test("矢印キー以外は無視する", () => {
    const { getByText, container } = render(<Harness />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: "Enter" });
    expect(getByText("a").getAttribute("aria-selected")).toBe("true");
  });
});
