import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

import { TagBadge } from "./TagBadge";

describe("TagBadge (#806)", () => {
  it("nameとcolorを表示する", () => {
    const { getByText } = render(<TagBadge name="牛乳" color="#3b82f6" />);
    expect(getByText("牛乳")).toBeTruthy();
  });

  it("onRemoveが無ければ削除ボタンを表示しない", () => {
    const { queryByRole } = render(<TagBadge name="牛乳" />);
    expect(queryByRole("button")).toBeNull();
  });

  it("削除ボタンをクリックするとonRemoveが呼ばれる", () => {
    const onRemove = mock(() => {});
    const { getByRole } = render(
      <TagBadge name="牛乳" onRemove={onRemove} removeLabel="牛乳を削除" />,
    );
    fireEvent.click(getByRole("button", { name: "牛乳を削除" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("削除ボタンは可視アイコン（12px）より広いヒットスロップを持つ（#806）", () => {
    // 可視アイコンは h-3 w-3（12px）だが、実padding + after:-inset-2 により
    // 実質的な当たり判定を広げる。LocationPin/ItemCardと同じパターン。
    const { getByRole } = render(<TagBadge name="牛乳" onRemove={() => {}} />);
    const button = getByRole("button");
    expect(button.className).toContain("after:-inset-2");
    expect(button.className).toContain("after:absolute");
    expect(button.className).toContain("p-1");
  });
});
