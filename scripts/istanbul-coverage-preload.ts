/**
 * Branch / Statement カバレッジ計測用のテストプリロード。
 *
 * bun test の組み込みカバレッジ (--coverage) は Lines / Functions しか
 * 計測できないため、ISTANBUL_COVERAGE=1 のときだけ babel-plugin-istanbul で
 * src 配下のソースを計装し、テスト終了時に .nyc_output/coverage.json へ
 * 書き出す。レポートは `bunx nyc report` で表示する。
 *
 * 実行例: bun run coverage:istanbul
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { transformSync } from "@babel/core";
import { plugin } from "bun";
import { afterAll } from "bun:test";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

if (process.env.ISTANBUL_COVERAGE === "1") {
  const srcDir = join(process.cwd(), "src");
  const srcFilter = new RegExp(`^${escapeRegExp(srcDir)}/.*\\.(ts|tsx)$`);

  // テストコード自身とテスト補助・Storybook はカバレッジ対象外にする
  const isExcluded = (path: string) =>
    /\.(test|stories)\.(ts|tsx)$/.test(path) ||
    path.startsWith(join(srcDir, "test") + "/") ||
    path.startsWith(join(srcDir, "mocks") + "/");

  plugin({
    name: "istanbul-instrument",
    setup(build) {
      build.onLoad({ filter: srcFilter }, async (args) => {
        const source = await Bun.file(args.path).text();
        const loader = args.path.endsWith(".tsx") ? "tsx" : "ts";
        if (isExcluded(args.path)) {
          return { contents: source, loader };
        }

        const result = transformSync(source, {
          filename: args.path,
          configFile: false,
          babelrc: false,
          sourceMaps: "inline",
          presets: ["@babel/preset-typescript", ["@babel/preset-react", { runtime: "automatic" }]],
          plugins: [["babel-plugin-istanbul", { cwd: process.cwd() }]],
        });

        if (!result?.code) {
          return { contents: source, loader };
        }
        return { contents: result.code, loader: "js" };
      });
    },
  });

  // グローバル afterAll は各テストファイルの終了ごとに呼ばれる。
  // __coverage__ はプロセス全体で累積されるため、毎回上書き保存すれば
  // 最終的に全ファイル分のカバレッジが残る。
  afterAll(() => {
    const coverage = (globalThis as Record<string, unknown>).__coverage__;
    if (!coverage) return;
    const outDir = join(process.cwd(), ".nyc_output");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "coverage.json"), JSON.stringify(coverage));
  });
}
