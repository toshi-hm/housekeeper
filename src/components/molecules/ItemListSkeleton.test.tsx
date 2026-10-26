import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ItemListSkeleton } from "./ItemListSkeleton";
import { ShoppingListSkeleton } from "./ShoppingListSkeleton";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ItemListSkeleton", () => {
  it("renders the requested number of grid cards and announces busy state", () => {
    const { container, getByRole } = render(<ItemListSkeleton variant="grid" count={3} />, {
      wrapper,
    });
    expect(container.querySelectorAll(".grid > div")).toHaveLength(3);
    expect(getByRole("status").getAttribute("aria-busy")).toBe("true");
  });

  it("renders list rows for the list variant", () => {
    const { container } = render(<ItemListSkeleton variant="list" count={4} />, { wrapper });
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });
});

describe("ShoppingListSkeleton", () => {
  it("renders the requested number of rows and announces busy state", () => {
    const { container, getByRole } = render(<ShoppingListSkeleton count={2} />, { wrapper });
    expect(container.querySelectorAll(".rounded-lg.border")).toHaveLength(2);
    expect(getByRole("status").getAttribute("aria-busy")).toBe("true");
  });
});
