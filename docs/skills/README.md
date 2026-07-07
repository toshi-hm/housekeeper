# Claude Code Skills — 設計方針・実装方針

housekeeper リポジトリに同梱する Claude Code skills の設計記録。
skills の実体は `.claude/skills/<name>/SKILL.md` に置く。

## 1. 目的

- **開発の型化**: このプロジェクト固有の規約（Atomic Design / bun test / TypeScript 記法ルール /
  Storybook 必須 など）を、毎回 CLAUDE.md と specs を読み直さなくても確実に適用できるようにする
- **レビューの型化**: UI/UX・PWA など「観点の抜け漏れ」が起きやすい領域をチェックリスト化する
- **企画の型化**: 新機能提案 → spec ドラフト → PLANS.md 反映、の一連の流れを再現可能にする
- **生活への活用**: housekeeper が持つ在庫データ（Supabase）を、献立提案や週次レビューなど
  「開発以外の価値」に接続する

## 2. 設計方針

### 2.1. ファイル構成

```
.claude/skills/
  <skill-name>/
    SKILL.md        # スキル本体（frontmatter + 手順）
docs/skills/
  README.md         # 本ドキュメント（設計方針 + カタログ）
```

- 既存の `issue-sync` スキルと同じ構成に揃える
- **1 スキル = 1 ファイルで自己完結** させる。SKILL.md だけ読めば
  他の AI（Codex 等）でも同じ手順を再現できる状態を保つ
- ただし「このリポジトリの spec を読め」という指示は含めてよい
  （spec が真実の源であり、スキルに複製するとメンテ二重化するため）

### 2.2. frontmatter 規約

```yaml
---
name: <kebab-case のスキル名>
description: >-
  いつ発動すべきかを書く。日本語のトリガーフレーズ例を必ず含める
  （ユーザーは日本語で依頼するため）。
---
```

- `description` は「何をするか」ではなく **「いつ使うか」** を主体に書く
  （Claude Code はこの文でスキル選択を判断する）
- 日本語トリガー例（「〜して」「〜をレビュー」）を明記する

### 2.3. 本文の書き方

- 手順は Step 形式で番号付けし、**判断が必要な箇所には判断基準（表・条件）を添える**
- コード例はこのリポジトリの実コードのパターンをそのまま使う（架空の API を書かない）
- 「やってはいけないこと」（アンチパターン）を明示する
- 完了条件（Definition of Done）を末尾に置く
- コミットの実施可否はスキル側で規定せず、ユーザー指示とセッションの文脈に従う

### 2.4. プロジェクト依存度による分類

| 分類             | 特徴                                                 | 該当スキル                                                                                 |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| プロジェクト固有 | このリポジトリの spec / 規約 / DB スキーマに強く依存 | react-component, unit-test, pwa-doctor, feature-proposal, recipe-from-stock, pantry-review |
| 汎用寄り         | 一般原則が主体で、プロジェクト規約を上書き適用する   | ts-quality, uiux-review                                                                    |

汎用寄りのスキルでも「このリポジトリではこうする」という節を必ず設け、
一般論とプロジェクト規約が矛盾する場合は **プロジェクト規約を優先** する。

## 3. スキルカタログ

### 開発系

| スキル             | 目的                                                                         | 主なトリガー                                         |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `react-component`  | Atomic Design 準拠で新規コンポーネントを作成（分類 → 実装 → Story → テスト） | 「コンポーネント作って」「〜を表示する UI が欲しい」 |
| `ts-quality`       | TypeScript strict 規約の適用・リファクタリング                               | 「リファクタして」「型を直して」「any を消して」     |
| `unit-test`        | bun test + Testing Library での単体テスト作成・修正                          | 「テスト書いて」「テストが落ちる」                   |
| `pwa-doctor`       | PWA / Service Worker / オフラインの診断・実装                                | 「PWA を確認して」「オフラインで動かない」           |
| `uiux-review`      | モバイルファースト UI/UX + アクセシビリティのレビュー                        | 「UI をレビューして」「使いやすさを見て」            |
| `feature-proposal` | 新機能の提案 → spec ドラフト → PLANS.md 反映                                 | 「新機能を提案して」「〜を企画して」                 |

### 生活系

| スキル              | 目的                                                 | 主なトリガー                             |
| ------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `recipe-from-stock` | 在庫データから期限優先の献立・レシピを提案           | 「今ある材料で何作れる？」「献立考えて」 |
| `pantry-review`     | 週次の在庫・期限・デッドストックレビューと買い物提案 | 「在庫レビューして」「食品ロス確認」     |

## 4. 実装方針（各スキルの設計判断）

### react-component

- **入口は分類判断**: 実装より先に `docs/specs/architecture.md` の分類表に当てて
  atoms / molecules / organisms / templates / pages を決めさせる。
  ここを間違えると hooks 使用可否・Story 要否がすべてずれるため
- Story（atoms/molecules/organisms は必須）とテストをコンポーネントと**同時に**作らせる。
  「後で書く」を許すと CLAUDE.md の規約違反が常態化する
- テンプレートコードは `ExpiryBadge` 系の実在パターンを基に記述

### ts-quality

- CLAUDE.md の「TypeScript 記法ルール」を **Before/After 形式**で網羅
  （`function` 宣言 → const arrow、`type` → `interface`、`any` → `unknown`+Zod、import type、Key Map）
- lint で機械検出できる違反と、できない違反（Zod の使いどころ、網羅性チェック）を分けて扱う
- 修正後は必ず `bun run format:check && bun run check` を通す

### unit-test

- **最重要の前提**: テストランナーは vitest / jest ではなく **bun test**。
  `import { describe, it, expect } from "bun:test"` を明記する
  （AI が vitest の API を書いてしまう事故が最も起きやすい）
- happy-dom + `bunfig.toml` の preload 構成、i18n wrapper、`src/mocks/supabase.ts` の
  使い方など、このリポジトリの実際のテスト基盤をそのまま文書化
- レイヤー別（atoms / molecules / hooks）に「何をテストすべきか」の指針を持たせる

### pwa-doctor

- `docs/specs/features/pwa.md` が真実の源。スキルは「診断の手順」と
  「spec との突き合わせチェックリスト」を提供する
- 方針の要点（injectManifest 戦略、参照のみオフライン、mutation 抑止、
  TanStack Query persist）をチェック項目に落とす
- 動作確認手順（build → preview → DevTools オフライン）を具体化

### uiux-review

- モバイルファースト（このアプリの必須制約）を最優先軸に置く
- 観点: タッチターゲット / 状態網羅（loading・error・empty）/ a11y /
  i18n（日英で文字幅が変わる）/ フォーム UX
- 出力形式を規定（severity 付き findings、`file:line` 参照）してレビューを再現可能にする

### feature-proposal

- 提案 → 承認 → spec ドラフト → PLANS.md §10 追記、の段階制。
  **spec ドラフトと PLANS.md 追記は提案が承認されてから**行う
- spec ドラフトは既存 spec（概要 / ユーザーストーリー / 実装方針 / データ / エラー / スコープ）の
  見出し構成を踏襲する
- PLANS.md に追記する TODO は `<!-- issue:#NN -->` を付けない
  （起票は issue-sync スキルの責務。責務を分離する）

### recipe-from-stock / pantry-review（生活系）

- データ取得は **Supabase MCP（read-only の SELECT）を第一候補**、
  使えない環境ではユーザーに在庫を貼ってもらうフォールバックを持つ
- **書き込みはしない**のが原則。買い物リスト追加などの書き込みは
  SQL を提示してユーザー確認を取ってからに限定する（生活系スキルが
  DB を壊すリスクを構造的に排除する）
- 期限接近アイテムの消費を最優先する（このアプリの存在意義＝食品ロス削減に直結）
- テーブル名・カラム名は `docs/specs/database.md` の実スキーマに一致させる

## 5. メンテナンス方針

- spec（docs/specs/\*\*）を変更したら、依存するスキルの記述が古くなっていないか確認する
- スキルにコード例を足すときは、必ず実在コードから引く（動かない例を置かない）
- スキルの追加・削除時は本ドキュメントのカタログと CLAUDE.md の一覧を更新する
