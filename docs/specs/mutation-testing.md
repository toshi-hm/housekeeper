# Mutation Testing (Stryker) 方針

本プロジェクトの Mutation Testing の運用方針をまとめる（#755）。

## 現状: Stryker + 週次スケジュール実行

`.github/workflows/mutation.yml` が毎週月曜 03:00 JST（+ `workflow_dispatch` による手動実行）に
`bunx stryker run` を実行する。`coverageAnalysis: "off"`（テストランナーが `command`
= `bun test` のため per-mutant のカバレッジ計測ができない）ため、1 mutant ごとに
テストスイート全体を再実行する。この方式は今の対象範囲（`src/hooks` / `src/lib` /
`src/types` + 後述の components 一部）でもコールドラン（キャッシュなし）で約 4 時間
かかるため、PR ごとの実行はブロックせず週次スケジュールに留めている（#674）。

## 頻度

- **週次スケジュール実行**（`mutation.yml` の `schedule` トリガー）を基本とする。
- `workflow_dispatch` で PR 番号を指定した手動実行も可能（結果を対象 PR にコメント投稿）。
- **PR をブロックする実行はしない**（コールドランのコストが CI の待ち時間として非現実的なため）。
  `incremental: true` によりインクリメンタルキャッシュ（`reports/stryker-incremental.json`、
  `mutation.yml` 側で `actions/cache` を使い run 間で引き継ぐ）を使うと2回目以降は
  大幅に高速化されるが、それでも「PRごとに毎回」を正当化できるコストではない。

## 閾値（`thresholds.break`）

2026-08-02 の週次実行（対象範囲: `src/hooks` + `src/lib` + `src/types`、5414 mutants）で
実測したベースラインスコアは **45.3%**（2454/5414 killed）。多くのファイルが 0%
（テストはあるが mutant を検知できていない: `useAppBadge.ts` / `useMfa.ts` /
`useNotificationPreferences.ts` / `useStats.ts` / `useUserSettings.ts` /
`share.ts` / `supabase.ts` 等）であり、`low`（旧: 60%）を大きく下回っていた。
`break` が `null`（無効）だったため、この実態はどの週次実行でも CI を失敗させておらず
気づかれにくい状態になっていた。

このスコア実態を踏まえ:

- `break: 35` / `low: 45` — 45.3% の実測ベースラインから余裕を持たせた最低ライン。
  この PR は同時に `mutate` へ `src/components/molecules/ItemCard.tsx` /
  `ItemListRow.tsx` を追加しており（後述）、この2ファイルを含めた合算スコアは
  **未計測**（Stryker 本体の実行には約4時間かかり、この変更のレビュー時点では
  実行できていない）。仮にこの2ファイルのスコアが0%近くでも、既存範囲
  （5414 mutants）に対する追加ファイルの行数比率（約311行、既存の対象範囲全体からすれば
  小さい）から見て合算スコアが 45.3% から大きく下振れすることは考えにくいが、
  「対象範囲拡大」と「閾値の有効化」を同時に行うこと自体がリスクなので、
  実測ベースラインからさらに広めに（60%→50%→45%ではなく、45.3%から10pt引いた
  35%を `break` に）マージンを取った。**次回の週次実行（mutation.yml のスケジュール
  実行）で実際の合算スコアが判明したら、その値を踏まえて `break`/`low` を
  再校正すること**（このマージンはあくまで暫定の安全策であり、確定値ではない）。
- `high: 80` — 変更なし。長期的な目標値として維持する。

スコアが実際に改善した際は、`break`/`low` を漸進的に引き上げていく
（一度に `high` へジャンプさせない — サバイブしている mutant の多くはテスト不足の
実態を表しているため、閾値を上げる前にテストを追加してスコアを底上げする）。

## 対象範囲（`mutate`）

- 既存: `src/hooks/**/*.ts` / `src/lib/**/*.ts` / `src/types/**/*.ts`
  （`*.test.ts(x)` / `*.stories.tsx` / `src/types/supabase.ts`（自動生成）は除外）
- 追加（#755）: `src/components/molecules/ItemCard.tsx` /
  `src/components/molecules/ItemListRow.tsx` — 在庫の数量デクリメント/消費操作など
  実ビジネスロジックを含む代表的なコンポーネントとして、コンポーネント層への
  段階的拡大の第一歩とする。
- **`src/components/` 全体への一括拡大はしない**: 1 mutant あたりテストスイート全体を
  再実行する現方式では、対象行数に応じてコストがほぼ線形に増える。まずは代表的な
  数ファイルでコスト影響を観測してから、次の拡大対象を判断する（follow-up）。

## 既知の問題と対処

- `.agents` / `.claude` はどちらも `skills/` へのシンボリックリンクを含む
  （ディレクトリへのシンボリックリンク）。Stryker のサンドボックスコピーは
  シンボリックリンクされたディレクトリを通常ファイルとして `copyFile` しようとして
  `EISDIR` で丸ごとクラッシュする（2026-08-09 の週次実行で発生、
  mutation.json が全く生成されず気づかれた）。`ignorePatterns` に `.agents` を追加し、
  サンドボックスへコピーする対象から除外することで解消した。今後 `skills/` 配下に
  シンボリックリンクを追加する際は、この一覧が最新か確認すること。

## 実装メモ

- `stryker.config.json`: `mutate` / `ignorePatterns` / `thresholds` を管理。
- `mutation.yml`: 週次実行 + PR コメント投稿（`workflow_dispatch` 時のみ）。
- `scripts/mutation-report.ts`: `reports/mutation/mutation.json` から Markdown
  レポート（サバイブしているファイル一覧など）を生成する。
