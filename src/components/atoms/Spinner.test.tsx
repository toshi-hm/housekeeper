import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders with default aria-label in English", () => {
    const { container } = render(<Spinner />);
    const el = container.firstChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-label")).toBe("Loading");
  });

  it("renders with custom aria-label", () => {
    const { container } = render(<Spinner label="読み込み中" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-label")).toBe("読み込み中");
  });

  it("applies custom className", () => {
    const { container } = render(<Spinner className="h-4 w-4" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4 w-4");
  });
});
