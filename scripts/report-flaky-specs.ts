#!/usr/bin/env bun
// Playwright の JSON reporter 出力からリトライが発生したspecを抽出し、
// PRコメント用の Markdown サマリーを組み立てる (#816)。
// リトライが一件も無ければ空文字を出力する（コメントを増やさないため、
// 呼び出し側のワークフローは出力が空ならコメント投稿自体をスキップする）。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type TestStatus = "expected" | "unexpected" | "flaky" | "skipped";

interface JSONReportTestResult {
  status: string | undefined;
  duration: number;
  retry: number;
}

interface JSONReportTest {
  projectName: string;
  results: JSONReportTestResult[];
  status: TestStatus;
}

interface JSONReportSpec {
  title: string;
  file: string;
  tests: JSONReportTest[];
}

interface JSONReportSuite {
  specs: JSONReportSpec[];
  suites?: JSONReportSuite[];
}

interface JSONReport {
  suites: JSONReportSuite[];
  stats: {
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
}

interface RetriedEntry {
  file: string;
  title: string;
  projectName: string;
  status: TestStatus;
  attempts: number;
  finalStatus: string | undefined;
}

const collectSpecs = (suites: JSONReportSuite[]): JSONReportSpec[] =>
  suites.flatMap((suite) => [...suite.specs, ...collectSpecs(suite.suites ?? [])]);

// リトライが発生した(=2回以上試行した)、または最終的に失敗したテストのみを対象にする。
// skipped や、リトライ無しで一発合格(expected かつ 1試行)のテストは対象外。
const isNotable = (test: JSONReportTest): boolean =>
  test.results.length > 1 || test.status === "unexpected";

const statusEmoji = {
  flaky: "🔁",
  unexpected: "❌",
  expected: "✅",
  skipped: "⏭️",
} as const satisfies Record<TestStatus, string>;

const reportPath = resolve(process.argv[2] ?? "playwright-report/results.json");

if (!existsSync(reportPath)) {
  // レポート自体が生成されていない（webServer起動失敗など）場合は、
  // リトライ可視化としては報告することが無いため何も出力しない。
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as JSONReport;

const entries: RetriedEntry[] = [];
for (const spec of collectSpecs(report.suites)) {
  for (const test of spec.tests) {
    if (!isNotable(test)) continue;
    const last = test.results[test.results.length - 1];
    entries.push({
      file: spec.file,
      title: spec.title,
      projectName: test.projectName,
      status: test.status,
      attempts: test.results.length,
      finalStatus: last?.status,
    });
  }
}

if (entries.length === 0) {
  process.exit(0);
}

entries.sort((a, b) => b.attempts - a.attempts || a.file.localeCompare(b.file));

const lines: string[] = [];
lines.push("## 🔁 E2E Flaky Report");
lines.push("");
lines.push(
  `今回の実行でリトライが発生した(または最終的に失敗した) spec が ${entries.length} 件あります。`,
);
lines.push("");
lines.push("| Status | Spec | Project | Attempts | Final result |");
lines.push("|---|---|---|---|---|");
for (const e of entries) {
  lines.push(
    `| ${statusEmoji[e.status]} ${e.status} | \`${e.file}\` › ${e.title} | ${e.projectName} | ${e.attempts} | ${e.finalStatus ?? "-"} |`,
  );
}
lines.push("");
lines.push(
  `<sub>expected: ${report.stats.expected} / flaky: ${report.stats.flaky} / unexpected: ${report.stats.unexpected} / skipped: ${report.stats.skipped}</sub>`,
);

console.log(lines.join("\n"));
