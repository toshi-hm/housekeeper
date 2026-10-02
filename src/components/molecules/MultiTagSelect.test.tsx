import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";

import type { Tag } from "@/types/item";

import { MultiTagSelect } from "./MultiTagSelect";

const tags: Tag[] = [
  { id: "1", user_id: "u", name: "オーガニック", color: "#22c55e", created_at: "" },
  { id: "2", user_id: "u", name: "冷凍可", color: "#3b82f6", created_at: "" },
];

const labels = {
  placeholder: "新しいタグ",
  addLabel: "追加",
  removeLabel: "削除",
  empty: "タグが選択されていません",
};

describe("MultiTagSelect — 未選択タグのトグルボタンのaria属性 (#1064)", () => {
  it("未選択タグのボタンにaria-pressed=falseとタグ名を含むaria-labelが付与される", () => {
    const onChange = mock(() => {});
    const { getByRole } = render(
      <MultiTagSelect tags={tags} selectedIds={[]} onChange={onChange} labels={labels} />,
    );

    const button = getByRole("button", { name: "追加: オーガニック" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(["1"]);
  });

  it("選択済みタグは未選択タグ一覧のトグルボタンとしては表示されない", () => {
    const onChange = mock(() => {});
    const { queryByRole } = render(
      <MultiTagSelect tags={tags} selectedIds={["1"]} onChange={onChange} labels={labels} />,
    );

    expect(queryByRole("button", { name: "追加: オーガニック" })).toBeNull();
    expect(queryByRole("button", { name: "追加: 冷凍可" })).not.toBeNull();
  });
});

describe("MultiTagSelect — 新規タグ作成失敗時のunhandled rejection防止 (#1080)", () => {
  it("onCreateがrejectしてもunhandled rejectionにならず、isCreatingが解除される", async () => {
    const user = userEvent.setup();
    const onChange = mock(() => {});
    const onCreate = mock(async (): Promise<Tag> => {
      throw new Error("duplicate");
    });
    const { getByPlaceholderText, getByRole } = render(
      <MultiTagSelect
        tags={tags}
        selectedIds={[]}
        onChange={onChange}
        onCreate={onCreate}
        labels={labels}
      />,
    );

    await user.type(getByPlaceholderText("新しいタグ"), "新しい名前");
    await user.click(getByRole("button", { name: "追加" }));

    await waitFor(() =>
      expect((getByRole("button", { name: "追加" }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(onCreate).toHaveBeenCalledWith("新しい名前");
    expect(onChange).not.toHaveBeenCalled();
  });
});
