#!/usr/bin/env bun
// Summarizes a Stryker JSON mutation report into a Markdown comment for CI.
// Scoring follows Stryker's own convention: Killed/Timeout count as detected,
// Survived/NoCoverage count as undetected, Ignored/CompileError/RuntimeError
// are excluded from the score entirely.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Mutant {
  status: string;
}

interface MutationFile {
  mutants: Mutant[];
}

interface MutationReport {
  files: Record<string, MutationFile>;
}

interface StrykerThresholds {
  high: number;
  low: number;
}

interface StrykerConfig {
  thresholds: StrykerThresholds;
  jsonReporter?: { fileName?: string };
}

interface FileScore {
  path: string;
  killed: number;
  survived: number;
  timeout: number;
  noCoverage: number;
  ignored: number;
  invalid: number;
  detected: number;
  valid: number;
  score: number | null;
}

const DETECTED_STATUSES = new Set(["Killed", "Timeout"]);
const UNDETECTED_STATUSES = new Set(["Survived", "NoCoverage"]);

const scoreFile = (path: string, mutants: Mutant[]): FileScore => {
  const counts = { killed: 0, survived: 0, timeout: 0, noCoverage: 0, ignored: 0, invalid: 0 };
  for (const mutant of mutants) {
    if (mutant.status === "Killed") counts.killed += 1;
    else if (mutant.status === "Survived") counts.survived += 1;
    else if (mutant.status === "Timeout") counts.timeout += 1;
    else if (mutant.status === "NoCoverage") counts.noCoverage += 1;
    else if (mutant.status === "Ignored") counts.ignored += 1;
    else counts.invalid += 1;
  }
  const detected = mutants.filter((m) => DETECTED_STATUSES.has(m.status)).length;
  const undetected = mutants.filter((m) => UNDETECTED_STATUSES.has(m.status)).length;
  const valid = detected + undetected;
  const score = valid > 0 ? (detected / valid) * 100 : null;
  return { path, ...counts, detected, valid, score };
};

const formatScore = (score: number | null): string =>
  score === null ? "N/A" : `${score.toFixed(1)}%`;

const badge = (score: number | null, thresholds: StrykerThresholds): string => {
  if (score === null) return "⚪";
  if (score >= thresholds.high) return "✅";
  if (score >= thresholds.low) return "🟡";
  return "⚠️";
};

const configPath = resolve(process.argv[2] ?? "stryker.config.json");
const reportPathArg = process.argv[3];

if (!existsSync(configPath)) {
  console.log(
    `## 🧬 Mutation Testing Report\n\n❌ Could not find Stryker config at \`${configPath}\`.`,
  );
  process.exit(0);
}

const config = JSON.parse(readFileSync(configPath, "utf8")) as StrykerConfig;
const thresholds = config.thresholds;
const reportPath = resolve(
  reportPathArg ?? config.jsonReporter?.fileName ?? "reports/mutation/mutation.json",
);

if (!existsSync(reportPath)) {
  console.log(
    `## 🧬 Mutation Testing Report\n\n❌ Mutation testing did not produce a report at \`${reportPath}\`. Check the job logs for errors.`,
  );
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as MutationReport;

const fileScores = Object.entries(report.files)
  .map(([path, file]) => scoreFile(path, file.mutants))
  .filter((f) => f.valid > 0 || f.survived > 0);

const totalDetected = fileScores.reduce((sum, f) => sum + f.detected, 0);
const totalValid = fileScores.reduce((sum, f) => sum + f.valid, 0);
const overallScore = totalValid > 0 ? (totalDetected / totalValid) * 100 : null;

const lines: string[] = [];
lines.push("## 🧬 Mutation Testing Report");
lines.push("");
lines.push(`**Mutation Score: ${formatScore(overallScore)}** ${badge(overallScore, thresholds)}`);
lines.push("");
lines.push(`| Detected | Total valid mutants | High threshold | Low threshold |`);
lines.push(`|---|---|---|---|`);
lines.push(`| ${totalDetected} | ${totalValid} | ${thresholds.high}% | ${thresholds.low}% |`);
lines.push("");

if (overallScore !== null && overallScore < thresholds.low) {
  lines.push(
    `⚠️ **Mutation score is below the threshold (${thresholds.low}%).** Some code changes are not verified by tests — please strengthen existing tests or add new ones for the surviving mutants below.`,
  );
  lines.push("");
}

const worstFiles = fileScores
  .filter((f) => f.survived > 0)
  .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
  .slice(0, 10);

if (worstFiles.length > 0) {
  lines.push("<details>");
  lines.push("<summary>Files with surviving mutants</summary>");
  lines.push("");
  lines.push("| File | Score | Killed | Survived | No coverage |");
  lines.push("|---|---|---|---|---|");
  for (const f of worstFiles) {
    lines.push(
      `| \`${f.path}\` | ${formatScore(f.score)} | ${f.killed} | ${f.survived} | ${f.noCoverage} |`,
    );
  }
  lines.push("");
  lines.push("</details>");
}

console.log(lines.join("\n"));
