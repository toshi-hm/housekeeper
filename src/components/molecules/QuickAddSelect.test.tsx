import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { QuickAddSelect } from "./QuickAddSelect";

const renderSelect = (props: Partial<React.ComponentProps<typeof QuickAddSelect>> = {}) => {
  const onChange = mock(() => {});
  const onDelete = mock(() => Promise.resolve());
  const result = render(
    <I18nextProvider i18n={i18n}>
      <QuickAddSelect
        value="custom"
        onChange={onChange}
        options={[
          { value: "preset", label: "Preset" },
          { value: "custom", label: "Custom" },
        ]}
        onAdd={() => Promise.resolve()}
        onDelete={onDelete}
        {...props}
      />
    </I18nextProvider>,
  );
  return { ...result, onChange, onDelete };
};

describe("QuickAddSelect deletion", () => {
  it("clears a selected master-data reference by default", async () => {
    const { getByRole, getAllByRole, onChange, onDelete } = renderSelect();
    fireEvent.click(getByRole("button", { name: /Custom/i }));
    fireEvent.click(getAllByRole("button", { name: i18n.t("common:delete") })[1]!);

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("custom"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("keeps copied text selected when its custom-unit row is deleted", async () => {
    const { getByRole, getAllByRole, onChange, onDelete } = renderSelect({
      allowClear: false,
      clearSelectionOnDelete: false,
    });
    fireEvent.click(getByRole("button", { name: /Custom/i }));
    fireEvent.click(getAllByRole("button", { name: i18n.t("common:delete") })[1]!);

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("custom"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
