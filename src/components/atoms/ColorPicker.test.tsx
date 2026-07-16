import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { ColorPicker } from "./ColorPicker";

describe("ColorPicker", () => {
  it("marks the selected color with aria-pressed and a visible ring", () => {
    const { getByLabelText } = render(<ColorPicker value="#3b82f6" onChange={() => {}} />);
    const selected = getByLabelText("#3b82f6");
    const unselected = getByLabelText("#ef4444");

    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.className).toContain("ring-ring");
    expect(unselected.getAttribute("aria-pressed")).toBe("false");
    expect(unselected.className).not.toContain("ring-ring");
  });

  it("marks no swatch as pressed when value is null", () => {
    const { getByLabelText } = render(<ColorPicker value={null} onChange={() => {}} />);
    expect(getByLabelText("#3b82f6").getAttribute("aria-pressed")).toBe("false");
  });
});
