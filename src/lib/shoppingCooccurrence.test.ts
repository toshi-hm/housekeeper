import { describe, expect, test } from "bun:test";

import { buildCooccurrenceSuggestions } from "./shoppingCooccurrence";

interface Row {
  name: string;
  archived_at: string;
}

const row = (name: string, archived_at: string): Row => ({ name, archived_at });

describe("buildCooccurrenceSuggestions", () => {
  test("returns items that were archived in the same batch as the target", () => {
    const archived = [
      row("牛乳", "2026-07-01T10:00:00Z"),
      row("パン", "2026-07-01T10:00:00Z"),
      row("卵", "2026-07-08T10:00:00Z"),
    ];
    expect(buildCooccurrenceSuggestions(archived, "牛乳")).toEqual(["パン"]);
  });

  test("sorts by co-purchase frequency, most frequent first", () => {
    const archived = [
      row("牛乳", "2026-07-01T10:00:00Z"),
      row("パン", "2026-07-01T10:00:00Z"),
      row("牛乳", "2026-07-08T10:00:00Z"),
      row("パン", "2026-07-08T10:00:00Z"),
      row("牛乳", "2026-07-15T10:00:00Z"),
      row("卵", "2026-07-15T10:00:00Z"),
    ];
    expect(buildCooccurrenceSuggestions(archived, "牛乳")).toEqual(["パン", "卵"]);
  });

  test("caps the result at `limit`", () => {
    const archived = [
      row("牛乳", "2026-07-01T10:00:00Z"),
      row("パン", "2026-07-01T10:00:00Z"),
      row("卵", "2026-07-01T10:00:00Z"),
      row("バター", "2026-07-01T10:00:00Z"),
    ];
    expect(buildCooccurrenceSuggestions(archived, "牛乳", [], 2)).toHaveLength(2);
  });

  test("excludes the target item and names already on excludeNames", () => {
    const archived = [
      row("牛乳", "2026-07-01T10:00:00Z"),
      row("牛乳", "2026-07-01T10:00:00Z"), // 同一バッチ内の重複行
      row("パン", "2026-07-01T10:00:00Z"),
    ];
    expect(buildCooccurrenceSuggestions(archived, "牛乳", ["パン"])).toEqual([]);
  });

  test("counts a repeated name within one batch only once (not once per row)", () => {
    const archived = [
      row("牛乳", "2026-07-01T10:00:00Z"),
      row("パン", "2026-07-01T10:00:00Z"),
      row("パン", "2026-07-01T10:00:00Z"),
      row("牛乳", "2026-07-08T10:00:00Z"),
      row("卵", "2026-07-08T10:00:00Z"),
    ];
    // パン appears twice in one batch (count=1 batch) vs 卵 in a separate batch (count=1 batch):
    // both should tie at 1, but パン must not out-rank 卵 due to row duplication.
    const result = buildCooccurrenceSuggestions(archived, "牛乳");
    expect(result).toContain("パン");
    expect(result).toContain("卵");
  });

  test("ignores batches that do not contain the target item at all", () => {
    const archived = [row("パン", "2026-07-01T10:00:00Z"), row("卵", "2026-07-01T10:00:00Z")];
    expect(buildCooccurrenceSuggestions(archived, "牛乳")).toEqual([]);
  });

  test("returns an empty array for a blank target name", () => {
    const archived = [row("牛乳", "2026-07-01T10:00:00Z")];
    expect(buildCooccurrenceSuggestions(archived, "   ")).toEqual([]);
  });

  test("matches target/exclude names after full-width/case/whitespace normalization", () => {
    const archived = [row("牛乳", "2026-07-01T10:00:00Z"), row("Bread", "2026-07-01T10:00:00Z")];
    expect(buildCooccurrenceSuggestions(archived, "牛乳", ["  bread  "])).toEqual([]);
  });
});
