import { describe, expect, test } from "bun:test";

import { filterNewTemplateItems } from "@/types/shopping";

describe("filterNewTemplateItems", () => {
  test("既にリストにある名前は除外する", () => {
    const result = filterNewTemplateItems(
      [
        { name: "牛乳", desired_units: 1 },
        { name: "卵", desired_units: 2 },
      ],
      ["牛乳"],
    );
    expect(result).toEqual([{ name: "卵", desired_units: 2 }]);
  });

  test("大文字小文字・前後空白を無視して比較する", () => {
    const result = filterNewTemplateItems([{ name: "  Milk ", desired_units: 1 }], ["milk"]);
    expect(result).toEqual([]);
  });

  test("テンプレート内の重複も1つにまとめる", () => {
    const result = filterNewTemplateItems(
      [
        { name: "パン", desired_units: 1 },
        { name: "パン", desired_units: 3 },
      ],
      [],
    );
    expect(result).toEqual([{ name: "パン", desired_units: 1 }]);
  });

  test("空の名前は無視する", () => {
    const result = filterNewTemplateItems([{ name: "  ", desired_units: 1 }], []);
    expect(result).toEqual([]);
  });
});
