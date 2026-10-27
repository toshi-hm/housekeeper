import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import { useState } from "react";

import { AutocompleteInput } from "./AutocompleteInput";

const SUGGESTIONS = ["牛乳", "牛乳パック", "豆乳"];

const Harness = ({
  initial = "",
  onEnter,
  onSelect,
}: {
  initial?: string;
  onEnter?: () => void;
  onSelect?: (v: string) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <AutocompleteInput
      aria-label="name"
      value={value}
      onValueChange={setValue}
      suggestions={SUGGESTIONS}
      onSuggestionSelect={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter?.();
      }}
    />
  );
};

describe("AutocompleteInput", () => {
  it("shows matching suggestions while typing", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    const input = view.getByRole("combobox");
    await user.type(input, "牛");
    expect(view.getAllByRole("option").map((o) => o.textContent)).toEqual(["牛乳", "牛乳パック"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows nothing when nothing matches", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.type(view.getByRole("combobox"), "zzz");
    expect(view.queryByRole("listbox")).toBeNull();
    expect(view.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
  });

  it("fills the input and reports the selection when an option is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = mock<(value: string) => void>(() => {});
    const view = render(<Harness onSelect={onSelect} />);
    const input = view.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "牛");
    await user.click(view.getByRole("option", { name: "牛乳パック" }));
    expect(input.value).toBe("牛乳パック");
    expect(onSelect).toHaveBeenCalledWith("牛乳パック");
    expect(view.queryByRole("listbox")).toBeNull();
  });

  it("selects the active option with arrow keys + Enter without triggering the parent Enter handler", async () => {
    const user = userEvent.setup();
    const onEnter = mock(() => {});
    const view = render(<Harness onEnter={onEnter} />);
    const input = view.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "牛");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      view.getAllByRole("option")[1]?.id ?? "",
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("牛乳パック");
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("passes Enter through when no option is active", async () => {
    const user = userEvent.setup();
    const onEnter = mock(() => {});
    const view = render(<Harness onEnter={onEnter} />);
    const input = view.getByRole("combobox");
    await user.type(input, "牛");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("closes the list on Escape and on blur", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    const input = view.getByRole("combobox");
    await user.type(input, "牛");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(view.queryByRole("listbox")).toBeNull();
    await user.clear(input);
    await user.type(input, "豆");
    expect(view.getByRole("listbox")).toBeTruthy();
    fireEvent.blur(input);
    expect(view.queryByRole("listbox")).toBeNull();
  });
});
