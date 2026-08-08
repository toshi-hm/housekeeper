import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

import { LocationPin } from "./LocationPin";

describe("LocationPin (#574)", () => {
  it("x/yの相対座標をleft/topのパーセントに変換して配置する", () => {
    const { getByRole } = render(<LocationPin x={0.25} y={0.75} label="牛乳" />);
    const button = getByRole("button", { name: "牛乳" });
    expect(button.style.left).toBe("25%");
    expect(button.style.top).toBe("75%");
  });

  it("クリックするとonClickが呼ばれる", () => {
    const onClick = mock(() => {});
    const { getByRole } = render(<LocationPin x={0.5} y={0.5} label="卵" onClick={onClick} />);
    fireEvent.click(getByRole("button", { name: "卵" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("可視アイコン（24px）より広いヒットスロップを持つ（#779）", () => {
    // 可視アイコンは h-6 w-6（24px）だが、after:-inset-2 により実質的な当たり
    // 判定は 24px + 8px×2 = 40px になる。ItemCardのクイックアクションボタン
    // と同じパターンでタップ領域を確保する。
    const { getByRole } = render(<LocationPin x={0.5} y={0.5} label="牛乳" onClick={() => {}} />);
    const button = getByRole("button", { name: "牛乳" });
    expect(button.className).toContain("after:-inset-2");
    expect(button.className).toContain("after:absolute");
  });

  it("onClickが無い（disabledな）ピンにはヒットスロップを付けない（#779）", () => {
    // disabledなbuttonはclickイベントが発火せず親へバブリングもしないため、
    // ヒットスロップを付けたままだと「タップしても無反応」な死角がアイコン
    // サイズ以上に広がってしまう（LocationPinPickerの写真コンテナ側onClickが
    // 参考ピンの直上で無効化される）。disabled:after:hiddenで無効化する。
    const { getByRole } = render(<LocationPin x={0.5} y={0.5} label="参考ピン" />);
    const button = getByRole("button", { name: "参考ピン" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("disabled:after:hidden");
  });
});
