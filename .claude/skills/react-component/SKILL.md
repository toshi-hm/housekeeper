---
name: react-component
description: >-
  Use when creating a new React component — 「コンポーネント作って」「〜を表示するUIが欲しい」
  「新しい画面/カード/バッジ/フォームを追加して」など。プロジェクトの分類規約（デフォルト: Atomic Design）に
  沿った配置判断から、実装・Story・単体テストの同時作成、規約チェックまでを一貫して行う。
---

# Skill: react-component

新規 React コンポーネントを作成する。
**分類 → 実装 → Story → テスト → チェック** を 1 セットで完了させる（Story とテストは後回しにしない）。

## Step 0. プロジェクト設定の解決

1. **同ディレクトリの `PROJECT.md` があれば読み、その設定を最優先する**
2. なければ以下から自動検出する:
   - `CLAUDE.md` / `CONTRIBUTING.md` — コンポーネント規約・配置ルール
   - `package.json` — パッケージマネージャ、Storybook / テストランナーの有無
   - 既存の `src/components/` 構造と近隣コンポーネント 2〜3 個（命名・スタイル手法・i18n の有無）
3. 検出できない項目のデフォルト:

| 項目     | デフォルト                                                 |
| -------- | ---------------------------------------------------------- |
| 分類規約 | Atomic Design（atoms/molecules/organisms/templates/pages） |
| Story    | Storybook が devDependencies にあれば必須、なければ省略    |
| テスト   | テスト基盤があれば必須、なければ省略して報告               |
| スタイル | 近隣コンポーネントに合わせる                               |

## Step 1. 分類（配置層）を決める

実装前に必ず分類を決め、ユーザーへの報告に判断根拠を含める。
Atomic Design の場合の判断表:

| 質問                                                        | Yes なら  |
| ----------------------------------------------------------- | --------- |
| props のみで動き、外部状態・hooks に依存しないか？          | atoms     |
| atoms を 2〜3 個組み合わせた小さな UI か？                  | molecules |
| hooks / データ取得を含む独立 UI ブロックか？                | organisms |
| children/slot でレイアウト骨格だけ提供するか？（ロジック0） | templates |
| ルーティングから import される最上位か？                    | pages     |

### 層の責務（一般則）

- 下位層（atoms/molecules）は表示専念。データ取得・グローバル状態に触らない
- データ取得・副作用は上位層（organisms 以上）に寄せる
- 迷ったら小さい方（下位層）に倒し、報告に判断根拠を書く

## Step 2. コンポーネントを実装する

- プロジェクトの記法規約（PROJECT.md / lint 設定）に従う
- **モバイルファースト**が求められるプロジェクトでは、基本スタイルを最小幅で書き
  ブレークポイントは「広げる」方向にだけ使う
- i18n 導入済みのプロジェクトでは文字列をハードコードしない（全ロケールにキーを追加）
- 既存の UI 基盤（デザインシステム / shadcn/ui 等）に同等品があれば再利用する。車輪の再発明をしない
- props は最小にする。「将来使うかも」の props を先回りで生やさない

## Step 3. Story を作成する（Storybook 採用プロジェクトのみ）

- 配置・命名・必須 tags はプロジェクト規約に従う（デフォルト: コンポーネントと同階層に
  `<Name>.stories.tsx`、`tags: ["autodocs"]`、`satisfies Meta<typeof Component>` 形式）
- Story 名は英語で「状態」を表す（Default / Loading / Error / Empty など）。`Default` は必ず用意する
- props の分岐（状態バリエーション）をすべて網羅する
- データ取得が絡む層は decorator で Provider / mock を与える（既存 Story を参考にする）

## Step 4. テストを作成する

- ランナー・パターンは `unit-test` スキル（`.claude/skills/unit-test/SKILL.md`）に従う
- 最低限: 全 props 分岐で「描画される/されない」、コールバックが発火する

## Step 5. チェック

プロジェクトの format / lint / typecheck / test コマンド（PROJECT.md または
`package.json` の scripts から特定）をすべて通るまで修正する。

## やってはいけないこと

- Story・テストを「後で」にしてコンポーネントだけ完成扱いにする
- 下位層にデータ取得・グローバル状態を持ち込む
- 文字列のハードコード（i18n 採用プロジェクトの場合。全ロケール分のキーが必要）
- デザインシステムの生成物ディレクトリへの手書きコンポーネント追加
- 分類に迷ったまま実装を始める

## Definition of Done

- [ ] 分類の判断根拠を報告した
- [ ] コンポーネント + Story（対象なら）+ テストが揃っている
- [ ] i18n キーを全ロケールに追加した（該当する場合）
- [ ] プロジェクトの format / lint / typecheck / 対象テストが通った
