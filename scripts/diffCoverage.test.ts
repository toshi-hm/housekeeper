import { describe, expect, test } from "bun:test";

import { computeDiffCoverage, formatReport, parseAddedLines, parseLcov } from "./diffCoverage";

const LCOV = `SF:src/lib/a.ts
DA:1,1
DA:2,0
DA:3,2
end_of_record
SF:src/lib/a.test.ts
DA:1,1
end_of_record
`;

const DIFF = `diff --git a/src/lib/a.ts b/src/lib/a.ts
--- a/src/lib/a.ts
+++ b/src/lib/a.ts
@@ -1,0 +2,2 @@
+x
+y
@@ -5 +10 @@
+z
diff --git a/src/lib/gone.ts b/src/lib/gone.ts
--- a/src/lib/gone.ts
+++ /dev/null
@@ -1,3 +0,0 @@
`;

describe("parseLcov", () => {
  test("DA レコードをファイルごとに集計する", () => {
    const hits = parseLcov(LCOV);
    expect(hits.get("src/lib/a.ts")?.get(2)).toBe(0);
    expect(hits.get("src/lib/a.ts")?.get(3)).toBe(2);
  });
});

describe("parseAddedLines", () => {
  test("hunk から追加行番号を展開し、削除ファイルは無視する", () => {
    const added = parseAddedLines(DIFF);
    expect(added.get("src/lib/a.ts")).toEqual([2, 3, 10]);
    expect(added.has("src/lib/gone.ts")).toBe(false);
  });
});

describe("computeDiffCoverage", () => {
  test("実行可能行のみを対象に未カバー行を報告する", () => {
    const result = computeDiffCoverage(parseAddedLines(DIFF), parseLcov(LCOV));
    expect(result.total).toBe(2);
    expect(result.covered).toBe(1);
    expect(result.percent).toBe(50);
    expect(result.files[0]?.uncoveredLines).toEqual([2]);
  });

  test("テストファイルと lcov に無いファイルは除外する", () => {
    const added = new Map([
      ["src/lib/a.test.ts", [1]],
      ["src/lib/none.ts", [1]],
    ]);
    const result = computeDiffCoverage(added, parseLcov(LCOV));
    expect(result.percent).toBeNull();
  });
});

describe("formatReport", () => {
  test("しきい値未満なら警告アイコンを出す", () => {
    const result = computeDiffCoverage(parseAddedLines(DIFF), parseLcov(LCOV));
    expect(formatReport(result, 60)).toContain("⚠️");
    expect(formatReport(result, 40)).toContain("✅");
  });

  test("測定対象が無い場合はその旨を出す", () => {
    expect(formatReport({ files: [], covered: 0, total: 0, percent: null }, 60)).toContain(
      "測定対象の変更行はありません",
    );
  });
});
