import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { DashboardNotificationCenter } from "./DashboardNotificationCenter";

describe("DashboardNotificationCenter (#624)", () => {
  it("chipsが空のときは何もレンダリングしない", () => {
    const { container } = render(
      <DashboardNotificationCenter chips={[]}>
        <p>hidden content</p>
      </DashboardNotificationCenter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("chipsがあるときはサマリーバーを表示し、初期状態では展開エリアを表示しない", () => {
    const { getByText, queryByText } = render(
      <DashboardNotificationCenter chips={[{ key: "a", icon: null, text: "3件の期限切れ" }]}>
        <p>expanded content</p>
      </DashboardNotificationCenter>,
    );
    expect(getByText("3件の期限切れ")).not.toBeNull();
    expect(queryByText("expanded content")).toBeNull();
  });

  it("サマリーバーをタップすると展開エリアが表示され、再タップで閉じる", () => {
    const { getByRole, getByText, queryByText } = render(
      <DashboardNotificationCenter chips={[{ key: "a", icon: null, text: "3件の期限切れ" }]}>
        <p>expanded content</p>
      </DashboardNotificationCenter>,
    );
    const toggle = getByRole("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(getByText("expanded content")).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(queryByText("expanded content")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("複数のchipsをすべて表示する", () => {
    const { getByText } = render(
      <DashboardNotificationCenter
        chips={[
          { key: "a", icon: null, text: "3件の期限切れ" },
          { key: "b", icon: null, text: "2件の低在庫" },
        ]}
      >
        <p>content</p>
      </DashboardNotificationCenter>,
    );
    expect(getByText("3件の期限切れ")).not.toBeNull();
    expect(getByText("2件の低在庫")).not.toBeNull();
  });
});
