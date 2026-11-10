import { describe, expect, test } from "bun:test";

import { cn } from "./utils";

describe("cn", () => {
  test("偽値を除いてクラスを連結する", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  test("競合する Tailwind クラスは後勝ちでマージする", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
