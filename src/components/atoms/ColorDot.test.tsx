import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { ColorDot } from "./ColorDot";

describe("ColorDot", () => {
  it("renders with the given color", () => {
    const { container } = render(<ColorDot color="#3b82f6" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("#3b82f6");
  });

  it("falls back to a default color when color is null", () => {
    const { container } = render(<ColorDot color={null} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("#6b7280");
  });

  it("applies a custom className", () => {
    const { container } = render(<ColorDot color="#ef4444" className="h-5 w-5" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-5 w-5");
  });
});
