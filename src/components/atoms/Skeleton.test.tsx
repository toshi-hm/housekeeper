import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders a div with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.className).toContain("animate-pulse");
  });

  it("applies custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4 w-full");
  });
});
