import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import * as useItemsModule from "@/hooks/useItems";
import type { Item } from "@/types/item";

import { useNameSuggestions } from "./useNameSuggestions";

const makeItem = (name: string): Item => ({
  id: name,
  user_id: "u",
  name,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const mockItems = (items: Item[] | undefined) =>
  spyOn(useItemsModule, "useItems").mockReturnValue({
    data: items,
  } as unknown as ReturnType<typeof useItemsModule.useItems>);

describe("useNameSuggestions", () => {
  afterEach(() => mock.restore());

  test("アイテム名を重複除去して返す", () => {
    mockItems([makeItem("牛乳"), makeItem("卵"), makeItem("牛乳")]);
    const { result } = renderHook(() => useNameSuggestions());
    expect(result.current).toEqual(["牛乳", "卵"]);
  });

  test("前後の空白を除き、空名は除外する", () => {
    mockItems([makeItem("  牛乳 "), makeItem("   ")]);
    const { result } = renderHook(() => useNameSuggestions());
    expect(result.current).toEqual(["牛乳"]);
  });

  test("データ未取得なら空配列", () => {
    mockItems(undefined);
    const { result } = renderHook(() => useNameSuggestions());
    expect(result.current).toEqual([]);
  });

  test("enabled オプションを useItems に渡す", () => {
    const spy = mockItems([]);
    renderHook(() => useNameSuggestions({ enabled: false }));
    expect(spy).toHaveBeenCalledWith({}, "created_at", { enabled: false });
  });
});
