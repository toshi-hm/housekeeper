import { describe, expect, test } from "bun:test";

import { matchShelfScanCandidates, type ShelfScanMatchItem } from "@/lib/shelfScanMatch";

describe("matchShelfScanCandidates", () => {
  test("在庫が空・写真候補も空なら両方とも空配列", () => {
    const result = matchShelfScanCandidates([], []);
    expect(result.possiblyConsumed).toEqual([]);
    expect(result.possiblyUnregistered).toEqual([]);
  });

  test("在庫が空なら写真候補は全て未登録候補になる", () => {
    const result = matchShelfScanCandidates(["牛乳", "卵"], []);
    expect(result.possiblyConsumed).toEqual([]);
    expect(result.possiblyUnregistered).toEqual(["牛乳", "卵"]);
  });

  test("写真候補が空なら在庫は全て食べきった？候補になる", () => {
    const items: ShelfScanMatchItem[] = [
      { id: "1", name: "牛乳" },
      { id: "2", name: "卵" },
    ];
    const result = matchShelfScanCandidates([], items);
    expect(result.possiblyConsumed).toEqual(items);
    expect(result.possiblyUnregistered).toEqual([]);
  });

  test("完全一致する場合はどちらの候補にも入らない", () => {
    const items: ShelfScanMatchItem[] = [{ id: "1", name: "牛乳" }];
    const result = matchShelfScanCandidates(["牛乳"], items);
    expect(result.possiblyConsumed).toEqual([]);
    expect(result.possiblyUnregistered).toEqual([]);
  });

  test("表記揺れ（近い名前）でもsimilarItemMatchのロジックでマッチする", () => {
    // "たまねぎ" -> "たまねき" は1文字違い（similarItemMatch.test.tsと同じ距離）
    const items: ShelfScanMatchItem[] = [{ id: "1", name: "たまねぎ" }];
    const result = matchShelfScanCandidates(["たまねき"], items);
    expect(result.possiblyConsumed).toEqual([]);
    expect(result.possiblyUnregistered).toEqual([]);
  });

  test("似ていない名前はマッチせず、両方の候補バケットに振り分けられる", () => {
    const items: ShelfScanMatchItem[] = [{ id: "1", name: "牛乳" }];
    const result = matchShelfScanCandidates(["醤油"], items);
    expect(result.possiblyConsumed).toEqual(items);
    expect(result.possiblyUnregistered).toEqual(["醤油"]);
  });

  test("一部が一致し、残りが両方のバケットに振り分けられる（混在ケース）", () => {
    const items: ShelfScanMatchItem[] = [
      { id: "1", name: "牛乳" },
      { id: "2", name: "卵" },
      { id: "3", name: "にんじん" },
    ];
    // "牛乳"は写真にも写っている（一致）。"卵"は写真に写っていない → 食べきった？候補。
    // "醤油"は写真に写っているが在庫に無い → 未登録候補。"にんじん"も写真に無い → 食べきった？候補。
    const result = matchShelfScanCandidates(["牛乳", "醤油"], items);
    expect(result.possiblyConsumed).toEqual([
      { id: "2", name: "卵" },
      { id: "3", name: "にんじん" },
    ]);
    expect(result.possiblyUnregistered).toEqual(["醤油"]);
  });

  test("同じ既存アイテムに複数の写真候補が一致しても、食べきった？候補への計上は二重にならない", () => {
    const items: ShelfScanMatchItem[] = [{ id: "1", name: "牛乳" }];
    // Gemini側で重複除去済みの前提だが、念のため複数一致してもpossiblyConsumedは空のまま。
    const result = matchShelfScanCandidates(["牛乳", "牛乳"], items);
    expect(result.possiblyConsumed).toEqual([]);
    expect(result.possiblyUnregistered).toEqual([]);
  });

  test("同名の既存アイテムが複数あっても、一致した分だけ食べきった？候補から除外される", () => {
    const items: ShelfScanMatchItem[] = [
      { id: "1", name: "牛乳" },
      { id: "2", name: "牛乳" },
    ];
    // findSimilarItemは最初に見つかった最短距離の候補を返す実装のため、
    // 写真候補1件では既存アイテム1件しかマッチしない。
    const result = matchShelfScanCandidates(["牛乳"], items);
    expect(result.possiblyConsumed.length).toBe(1);
    expect(result.possiblyUnregistered).toEqual([]);
  });

  // #1025: Geminiのプロンプトはパッケージ表記からブランド名込みの具体的な商品名を
  // 返す一方、登録名はそこまで詳細でないことが多い。この詳細度の差は
  // findSimilarItemの長さ差フィルタを超えてしまうため、包含関係の追加判定
  // （findContainedItem）で拾えることを検証する。
  describe("詳細度の差（包含関係）によるマッチ（#1025）", () => {
    test("登録名が短く、OCR名がブランド名込みで具体的な場合でもマッチする", () => {
      const items: ShelfScanMatchItem[] = [{ id: "1", name: "牛乳" }];
      const result = matchShelfScanCandidates(["明治おいしい牛乳 1000ml"], items);
      expect(result.possiblyConsumed).toEqual([]);
      expect(result.possiblyUnregistered).toEqual([]);
    });

    test("OCR名が短く、登録名の方が具体的な場合でもマッチする（逆方向の包含）", () => {
      const items: ShelfScanMatchItem[] = [{ id: "1", name: "明治おいしい牛乳 1000ml" }];
      const result = matchShelfScanCandidates(["牛乳"], items);
      expect(result.possiblyConsumed).toEqual([]);
      expect(result.possiblyUnregistered).toEqual([]);
    });

    test("1文字などの極端に短い名前は包含判定の対象外とし、無関係な商品に誤マッチしない", () => {
      const items: ShelfScanMatchItem[] = [{ id: "1", name: "米" }];
      const result = matchShelfScanCandidates(["米麹甘酒 900ml"], items);
      expect(result.possiblyConsumed).toEqual(items);
      expect(result.possiblyUnregistered).toEqual(["米麹甘酒 900ml"]);
    });

    test("包含関係にない、明らかに無関係な商品名同士は依然としてマッチしない", () => {
      const items: ShelfScanMatchItem[] = [{ id: "1", name: "牛乳" }];
      const result = matchShelfScanCandidates(["キッコーマン特選丸大豆しょうゆ 1L"], items);
      expect(result.possiblyConsumed).toEqual(items);
      expect(result.possiblyUnregistered).toEqual(["キッコーマン特選丸大豆しょうゆ 1L"]);
    });

    test("複数の包含候補があれば、文字数差が最も小さい（詳細度が近い）ものを優先する", () => {
      const items: ShelfScanMatchItem[] = [
        { id: "1", name: "牛乳" },
        { id: "2", name: "おいしい牛乳" },
      ];
      // 「おいしい牛乳」の方が「明治おいしい牛乳 1000ml」に文字数が近いため、
      // そちらがマッチしたものとして扱われ、「牛乳」は食べきった？候補に残る。
      const result = matchShelfScanCandidates(["明治おいしい牛乳 1000ml"], items);
      expect(result.possiblyConsumed).toEqual([{ id: "1", name: "牛乳" }]);
      expect(result.possiblyUnregistered).toEqual([]);
    });
  });
});
