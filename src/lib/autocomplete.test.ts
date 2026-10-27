import { describe, expect, it } from "bun:test";

import { filterSuggestions } from "./autocomplete";

describe("filterSuggestions", () => {
  const names = ["牛乳", "豆乳", "牛乳パック", "Milk", "トマト", "ミニトマト"];

  it("returns nothing for an empty or whitespace query", () => {
    expect(filterSuggestions(names, "")).toEqual([]);
    expect(filterSuggestions(names, "  ")).toEqual([]);
  });

  it("lists prefix matches before partial matches", () => {
    expect(filterSuggestions(names, "乳")).toEqual(["牛乳", "豆乳", "牛乳パック"]);
    expect(filterSuggestions(names, "ト")).toEqual(["トマト", "ミニトマト"]);
  });

  it("excludes an exact match and duplicates", () => {
    expect(filterSuggestions(["牛乳", "牛乳", "牛乳パック"], "牛乳")).toEqual(["牛乳パック"]);
  });

  it("is case-insensitive and width-insensitive", () => {
    expect(filterSuggestions(names, "ｍｉｌ")).toEqual(["Milk"]);
  });

  it("matches hiragana input against katakana candidates", () => {
    expect(filterSuggestions(names, "とま")).toEqual(["トマト", "ミニトマト"]);
  });

  it("respects the limit", () => {
    expect(filterSuggestions(["a1", "a2", "a3"], "a", 2)).toEqual(["a1", "a2"]);
  });
});
