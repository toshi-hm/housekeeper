import { describe, expect, test } from "bun:test";

import {
  findSimilarItem,
  levenshteinDistance,
  normalizeItemName,
  type SimilarItemCandidate,
} from "@/lib/similarItemMatch";

describe("normalizeItemName", () => {
  test("前後の空白をトリムする", () => {
    expect(normalizeItemName("  たまねぎ  ")).toBe("たまねぎ");
  });

  test("中間の空白を除去する", () => {
    expect(normalizeItemName("たま ねぎ")).toBe("たまねぎ");
  });

  test("大文字小文字を無視する", () => {
    expect(normalizeItemName("Milk")).toBe("milk");
  });

  test("全角英数字を半角に正規化する（NFKC）", () => {
    expect(normalizeItemName("ｍｉｌｋ")).toBe("milk");
  });
});

describe("levenshteinDistance", () => {
  test("完全一致は距離0", () => {
    expect(levenshteinDistance("たまねぎ", "たまねぎ")).toBe(0);
  });

  test("一方が空文字なら他方の長さが距離になる", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  test("1文字の置換は距離1", () => {
    expect(levenshteinDistance("たまねぎ", "たまねき")).toBe(1);
  });

  test("1文字の挿入・削除は距離1", () => {
    expect(levenshteinDistance("にんじん", "にんじ")).toBe(1);
    expect(levenshteinDistance("にんじ", "にんじん")).toBe(1);
  });

  test("全く異なる文字列は距離が大きい", () => {
    expect(levenshteinDistance("たまねぎ", "牛乳")).toBeGreaterThanOrEqual(3);
  });
});

describe("findSimilarItem", () => {
  const candidates: SimilarItemCandidate[] = [
    { id: "1", name: "たまねぎ" },
    { id: "2", name: "牛乳" },
    { id: "3", name: "にんじん" },
  ];

  test("クエリが空文字なら null", () => {
    expect(findSimilarItem(candidates, "")).toBeNull();
    expect(findSimilarItem(candidates, "   ")).toBeNull();
  });

  test("候補が空なら null", () => {
    expect(findSimilarItem([], "たまねぎ")).toBeNull();
  });

  test("正規化後に完全一致する候補を返す（表記揺れの気づきと同様に有用）", () => {
    const match = findSimilarItem(candidates, "  たまねぎ  ");
    expect(match?.id).toBe("1");
    expect(match?.distance).toBe(0);
  });

  test("1文字違いの近い名前を検出する", () => {
    const match = findSimilarItem(candidates, "たまねき");
    expect(match?.id).toBe("1");
  });

  test("全く異なる名前では候補を返さない", () => {
    expect(findSimilarItem(candidates, "醤油")).toBeNull();
  });

  test("既存アイテムと無関係な新しい名前では候補を返さない", () => {
    expect(findSimilarItem(candidates, "冷凍餃子")).toBeNull();
  });

  test("複数候補があるときは最も距離が近いものを返す", () => {
    const closeCandidates: SimilarItemCandidate[] = [
      { id: "a", name: "にんじん" },
      { id: "b", name: "にんじゃ" },
    ];
    // "にんじん" -> "にんじゃ" は距離1、"にんじん" 自身は距離0
    const match = findSimilarItem(closeCandidates, "にんじん");
    expect(match?.id).toBe("a");
    expect(match?.distance).toBe(0);
  });

  test("名前が空の候補は無視する", () => {
    const withBlank: SimilarItemCandidate[] = [{ id: "x", name: "   " }, ...candidates];
    const match = findSimilarItem(withBlank, "たまねぎ");
    expect(match?.id).toBe("1");
  });
});
