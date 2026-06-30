import { describe, expect, test } from "bun:test";

import { chatResponseSchema } from "@/types/chat";

describe("chatResponseSchema", () => {
  test("parses a minimal valid response", () => {
    const result = chatResponseSchema.parse({ reply: "ありません。", items: [] });
    expect(result.reply).toBe("ありません。");
    expect(result.items).toEqual([]);
  });

  test("parses items with optional fields", () => {
    const result = chatResponseSchema.parse({
      reply: "牛乳は冷蔵庫に2本あります。",
      items: [
        {
          id: "item-1",
          name: "牛乳",
          total_remaining: "1000mL",
          expiry_date: "2026-07-10",
          storage_location: "冷蔵庫",
        },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.total_remaining).toBe("1000mL");
    expect(result.items[0]?.storage_location).toBe("冷蔵庫");
  });

  test("allows null expiry_date / storage_location", () => {
    const result = chatResponseSchema.parse({
      reply: "x",
      items: [{ id: "i", name: "n", expiry_date: null, storage_location: null }],
    });
    expect(result.items[0]?.expiry_date).toBeNull();
  });

  test("rejects a response missing reply", () => {
    expect(() => chatResponseSchema.parse({ items: [] })).toThrow();
  });

  test("rejects an item missing id", () => {
    expect(() => chatResponseSchema.parse({ reply: "x", items: [{ name: "n" }] })).toThrow();
  });
});
