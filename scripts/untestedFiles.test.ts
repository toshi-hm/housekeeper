import { describe, expect, it } from "bun:test";

import { findUntested, hasTest, isTargetSource } from "./untestedFiles";

describe("isTargetSource", () => {
  it("対象ディレクトリのソースのみ true", () => {
    expect(isTargetSource("src/hooks/useMfa.ts")).toBe(true);
    expect(isTargetSource("src/components/molecules/Foo.tsx")).toBe(true);
    expect(isTargetSource("src/components/atoms/Foo.tsx")).toBe(false);
    expect(isTargetSource("src/hooks/useMfa.test.ts")).toBe(false);
    expect(isTargetSource("src/components/molecules/Foo.stories.tsx")).toBe(false);
    expect(isTargetSource("src/lib/types.d.ts")).toBe(false);
    expect(isTargetSource("src/lib/data.json")).toBe(false);
  });
});

describe("hasTest", () => {
  const all = new Set([
    "src/hooks/useA.ts",
    "src/hooks/useA.test.ts",
    "src/hooks/useB.supabase.test.ts",
  ]);
  it("同名・サフィックス付きテストを検出する", () => {
    expect(hasTest("src/hooks/useA.ts", all)).toBe(true);
    expect(hasTest("src/hooks/useB.ts", all)).toBe(true);
  });
  it("前方一致だけの別名は誤検出しない", () => {
    expect(hasTest("src/hooks/use.ts", all)).toBe(false);
    expect(hasTest("src/hooks/useC.ts", all)).toBe(false);
  });
});

describe("findUntested", () => {
  it("未整備のみをソートして返す", () => {
    const all = new Set(["src/lib/b.ts", "src/lib/a.ts", "src/lib/c.ts", "src/lib/c.test.ts"]);
    expect(findUntested([...all], all)).toEqual(["src/lib/a.ts", "src/lib/b.ts"]);
  });
});
