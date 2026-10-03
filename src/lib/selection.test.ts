import { describe, expect, test } from "bun:test";

import { pruneSelection, toggleId, toggleSelectAll } from "@/lib/selection";

describe("toggleId", () => {
  test("未選択の ID を追加する", () => {
    const result = toggleId(new Set(["a"]), "b");
    expect([...result].sort()).toEqual(["a", "b"]);
  });

  test("選択済みの ID を解除する", () => {
    const result = toggleId(new Set(["a", "b"]), "a");
    expect([...result]).toEqual(["b"]);
  });

  test("元の Set を変更しない", () => {
    const original = new Set(["a"]);
    toggleId(original, "b");
    expect([...original]).toEqual(["a"]);
  });
});

describe("toggleSelectAll", () => {
  test("一部選択時は全選択になる", () => {
    const result = toggleSelectAll(new Set(["a"]), ["a", "b", "c"]);
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  test("全選択時は全解除になる", () => {
    const result = toggleSelectAll(new Set(["a", "b"]), ["a", "b"]);
    expect(result.size).toBe(0);
  });
});

describe("pruneSelection (#1140)", () => {
  test("表示中でない ID を除外する", () => {
    expect([...pruneSelection(new Set(["a", "b"]), ["b", "c"])]).toEqual(["b"]);
  });

  test("元の Set を変更しない", () => {
    const original = new Set(["a", "b"]);
    pruneSelection(original, ["b"]);
    expect([...original].sort()).toEqual(["a", "b"]);
  });
});

describe("toggleSelectAll with hidden selections (#1140)", () => {
  test("非表示の選択が混ざっていても、表示中が全選択でなければ全選択になる", () => {
    const result = toggleSelectAll(new Set(["hidden", "a"]), ["a", "b"]);
    expect([...result].sort()).toEqual(["a", "b"]);
  });
});
