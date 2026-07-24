import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

import { LocationPin } from "./LocationPin";

describe("LocationPin (#574)", () => {
  it("x/yの相対座標をleft/topのパーセントに変換して配置する", () => {
    const { getByRole } = render(<LocationPin x={0.25} y={0.75} label="牛乳" />);
    const button = getByRole("button", { name: "牛乳" });
    expect(button.style.left).toBe("25%");
    expect(button.style.top).toBe("75%");
  });

  it("クリックするとonClickが呼ばれる", () => {
    const onClick = mock(() => {});
    const { getByRole } = render(<LocationPin x={0.5} y={0.5} label="卵" onClick={onClick} />);
    fireEvent.click(getByRole("button", { name: "卵" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
