import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { MasterDataIcon } from "./MasterDataIcon";

describe("MasterDataIcon", () => {
  it("renders the icon svg for a known icon name", () => {
    const { container } = render(<MasterDataIcon icon="Refrigerator" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders nothing when icon is null", () => {
    const { container } = render(<MasterDataIcon icon={null} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders nothing when icon is unset", () => {
    const { container } = render(<MasterDataIcon />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders nothing for an unrecognized icon name", () => {
    const { container } = render(<MasterDataIcon icon="NotARealIcon" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
