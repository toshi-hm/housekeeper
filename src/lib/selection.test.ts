import { describe, expect, test } from "bun:test";

import { toggleId, toggleSelectAll } from "@/lib/selection";

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
