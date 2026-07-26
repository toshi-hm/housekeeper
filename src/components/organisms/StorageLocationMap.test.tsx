import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { StorageLocationMap } from "./StorageLocationMap";

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe("StorageLocationMap (#574)", () => {
  it("写真とピンを表示し、ピンをタップするとonItemClickが呼ばれる", () => {
    const onItemClick = mock(() => {});
    const { getByRole } = renderWithI18n(
      <StorageLocationMap
        photoUrl="https://signed.example/photo.jpg"
        pinnedItems={[{ id: "1", name: "牛乳", x: 0.2, y: 0.3 }]}
        onItemClick={onItemClick}
      />,
    );
    fireEvent.click(getByRole("button", { name: "牛乳" }));
    expect(onItemClick).toHaveBeenCalledWith("1");
  });

  it("写真が未登録のときは案内文を表示する", () => {
    const { getByText } = renderWithI18n(
      <StorageLocationMap photoUrl={null} unpinnedItems={[{ id: "1", name: "牛乳" }]} />,
    );
    expect(
      getByText(/この保管場所には写真が登録されていません|No photo has been added/),
    ).not.toBeNull();
  });

  it("位置未指定のアイテムは常にリスト表示される", () => {
    const onItemClick = mock(() => {});
    const { getByRole } = renderWithI18n(
      <StorageLocationMap
        photoUrl="https://signed.example/photo.jpg"
        pinnedItems={[]}
        unpinnedItems={[{ id: "2", name: "醤油" }]}
        onItemClick={onItemClick}
      />,
    );
    fireEvent.click(getByRole("button", { name: "醤油" }));
    expect(onItemClick).toHaveBeenCalledWith("2");
  });
});
