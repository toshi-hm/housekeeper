/**
 * 同名の単体テストが無いソースファイルを一覧する（issue #1295）。
 *
 * 対象: src/hooks, src/lib, src/components/{molecules,organisms} の `*.ts(x)`。
 * `*.test.*` `*.stories.*` `*.d.ts` は対象外。同名の `<name>.test.ts(x)` か
 * `<name>.<suffix>.test.ts(x)`（例: useItems.supabase.test.ts）があればテスト済みとみなす。
 *
 * 使い方:
 *   bun run scripts/untestedFiles.ts                    # 全体を一覧表示
 *   bun run scripts/untestedFiles.ts --changed <base>   # <base>...HEAD で「追加」されたファイルのみ検査。未整備があれば GitHub 警告を出す
 *   --strict を付けると未整備があるとき終了コード 1（既定は警告のみ）
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const TARGET_DIRS = [
  "src/hooks",
  "src/lib",
  "src/components/molecules",
  "src/components/organisms",
] as const;

const SOURCE_RE = /\.(ts|tsx)$/;
const EXCLUDED_RE = /\.(test|stories|d)\.(ts|tsx)$/;

export const isTargetSource = (path: string): boolean =>
  TARGET_DIRS.some((dir) => path.startsWith(`${dir}/`)) &&
  SOURCE_RE.test(path) &&
  !EXCLUDED_RE.test(path);

const stem = (path: string): string => path.replace(/\.(ts|tsx)$/, "");

/** ソースに対応するテストが `allFiles` に存在するか。 */
export const hasTest = (source: string, allFiles: ReadonlySet<string>): boolean => {
  const base = stem(source);
  for (const file of allFiles) {
    if (!/\.test\.(ts|tsx)$/.test(file)) continue;
    const testBase = file.replace(/\.test\.(ts|tsx)$/, "");
    if (testBase === base || testBase.startsWith(`${base}.`)) return true;
  }
  return false;
};

export const findUntested = (
  candidates: readonly string[],
  allFiles: ReadonlySet<string>,
): string[] => candidates.filter((f) => isTargetSource(f) && !hasTest(f, allFiles)).toSorted();

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const main = () => {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const changedIdx = args.indexOf("--changed");
  const base = changedIdx >= 0 ? args[changedIdx + 1] : undefined;

  const all = new Set(TARGET_DIRS.flatMap((d) => walk(d)));
  let candidates = [...all];
  if (changedIdx >= 0) {
    if (!base) {
      console.error("--changed には base ref が必要です");
      process.exit(2);
    }
    const diff = spawnSync(
      "git",
      ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`, "--", ...TARGET_DIRS],
      { encoding: "utf8" },
    );
    if (diff.status !== 0) {
      console.error(diff.stderr);
      process.exit(2);
    }
    candidates = diff.stdout.split("\n").filter(Boolean);
  }

  const untested = findUntested(candidates, all);
  if (untested.length === 0) {
    console.log("単体テスト未整備のファイルはありません");
    return;
  }

  if (changedIdx >= 0) {
    for (const f of untested) {
      console.log(`::warning file=${f}::新規ファイルに対応する単体テストがありません`);
    }
  } else {
    console.log(`単体テスト未整備: ${untested.length} 件`);
    for (const f of untested) console.log(`  ${f}`);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      `### 単体テスト未整備 (${untested.length})\n\n${untested.map((f) => `- \`${f}\``).join("\n")}\n`,
    );
  }
  if (strict) process.exit(1);
};

if (import.meta.main) main();
