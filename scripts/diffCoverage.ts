/**
 * PR の変更行に対する行カバレッジ（diff カバレッジ）を算出する（issue #1265）。
 *
 * 入力: bun の `coverage/lcov.info` と `git diff -U0` の出力。
 * 全体平均ではなく「PR が追加・変更した実行可能行のうちテストで通った割合」を見る。
 * 現状は警告のみ（終了コードは常に 0）。
 *
 * 使い方: bun run scripts/diffCoverage.ts <lcov.info> <base-ref> [threshold(0-100)]
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

/** ファイルパス → (行番号 → 実行回数)。lcov の DA レコードのみ対象。 */
export type LineHits = Map<string, Map<number, number>>;

export interface FileDiffCoverage {
  file: string;
  covered: number;
  total: number;
  uncoveredLines: number[];
}

export interface DiffCoverageResult {
  files: FileDiffCoverage[];
  covered: number;
  total: number;
  /** 0-100。測定対象の行が無い場合は null。 */
  percent: number | null;
}

export const parseLcov = (lcov: string): LineHits => {
  const result: LineHits = new Map();
  let current: Map<number, number> | null = null;
  for (const raw of lcov.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      const file = line.slice(3);
      current = result.get(file) ?? new Map();
      result.set(file, current);
    } else if (line === "end_of_record") {
      current = null;
    } else if (current && line.startsWith("DA:")) {
      const [lineNo, hits] = line.slice(3).split(",").map(Number);
      if (Number.isInteger(lineNo) && Number.isFinite(hits)) {
        current.set(lineNo as number, (current.get(lineNo as number) ?? 0) + (hits as number));
      }
    }
  }
  return result;
};

/** `git diff -U0` の出力から、ファイルごとの追加行番号（新側）を取り出す。 */
export const parseAddedLines = (diff: string): Map<string, number[]> => {
  const result = new Map<string, number[]>();
  let file: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.replace(/^\+\+\+ b\//, "");
      if (file) result.set(file, result.get(file) ?? []);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const lines = result.get(file) as number[];
      for (let i = 0; i < count; i++) lines.push(start + i);
    }
  }
  return result;
};

const isMeasuredSource = (file: string): boolean =>
  /^src\/.*\.(ts|tsx)$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file);

export const computeDiffCoverage = (
  added: Map<string, number[]>,
  hits: LineHits,
): DiffCoverageResult => {
  const files: FileDiffCoverage[] = [];
  for (const [file, lines] of added) {
    const fileHits = hits.get(file);
    if (!isMeasuredSource(file) || !fileHits) continue;
    // DA に現れない行（コメント・型定義など）は実行可能行ではないので除外する。
    const measured = lines.filter((n) => fileHits.has(n));
    if (measured.length === 0) continue;
    const uncoveredLines = measured.filter((n) => (fileHits.get(n) ?? 0) === 0);
    files.push({
      file,
      covered: measured.length - uncoveredLines.length,
      total: measured.length,
      uncoveredLines,
    });
  }
  const covered = files.reduce((s, f) => s + f.covered, 0);
  const total = files.reduce((s, f) => s + f.total, 0);
  return { files, covered, total, percent: total === 0 ? null : (covered / total) * 100 };
};

export const formatReport = (result: DiffCoverageResult, threshold: number): string => {
  if (result.percent === null) {
    return "## Diff coverage\n\n測定対象の変更行はありません。\n";
  }
  const status = result.percent < threshold ? "⚠️" : "✅";
  const rows = result.files
    .filter((f) => f.uncoveredLines.length > 0)
    .map((f) => `| \`${f.file}\` | ${f.covered}/${f.total} | ${f.uncoveredLines.join(", ")} |`);
  const table =
    rows.length > 0
      ? `\n| ファイル | カバー済み | 未カバー行 |\n| --- | --- | --- |\n${rows.join("\n")}\n`
      : "";
  return `## Diff coverage\n\n${status} 変更行カバレッジ: **${result.percent.toFixed(1)}%** (${result.covered}/${result.total}行、警告しきい値 ${threshold}%)\n${table}`;
};

const main = (): void => {
  const [lcovPath, baseRef, thresholdArg] = process.argv.slice(2);
  if (!lcovPath || !baseRef) {
    console.error("usage: diffCoverage.ts <lcov.info> <base-ref> [threshold]");
    process.exit(0);
  }
  const threshold = thresholdArg ? Number(thresholdArg) : 60;
  const diff = spawnSync("git", ["diff", "-U0", "--no-color", `${baseRef}...HEAD`, "--", "src"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const lcov = readFileSync(lcovPath, "utf8");
  const result = computeDiffCoverage(parseAddedLines(diff.stdout), parseLcov(lcov));
  const report = formatReport(result, threshold);
  console.log(report);
  if (result.percent !== null && result.percent < threshold) {
    console.log(
      `::warning title=Diff coverage::変更行カバレッジ ${result.percent.toFixed(1)}% がしきい値 ${threshold}% 未満です`,
    );
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, report);
};

if (import.meta.main) main();
