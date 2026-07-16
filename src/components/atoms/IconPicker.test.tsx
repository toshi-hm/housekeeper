import { render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

import { IconPicker } from "./IconPicker";

describe("IconPicker", () => {
  it("marks the selected icon with aria-pressed", () => {
    const { getByLabelText } = render(<IconPicker value="Refrigerator" onChange={() => {}} />);
    const selected = getByLabelText("Refrigerator");
    const unselected = getByLabelText("Snowflake");

    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(unselected.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks no icon as pressed when value is null", () => {
    const { getByLabelText } = render(<IconPicker value={null} onChange={() => {}} />);
    expect(getByLabelText("Refrigerator").getAttribute("aria-pressed")).toBe("false");
  });

  it("clears the selection when clicking the already-selected icon", () => {
    const onChange = mock((icon: string | null) => icon);
    const { getByLabelText } = render(<IconPicker value="Refrigerator" onChange={onChange} />);
    getByLabelText("Refrigerator").click();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("selects a new icon when clicking an unselected icon", () => {
    const onChange = mock((icon: string | null) => icon);
    const { getByLabelText } = render(<IconPicker value={null} onChange={onChange} />);
    getByLabelText("Snowflake").click();
    expect(onChange).toHaveBeenCalledWith("Snowflake");
  });
});
