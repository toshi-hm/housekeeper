---
name: feature-proposal
description: >-
  Use when proposing or planning a new feature — 「新機能を提案して」「〜を企画して」「〜って機能どう思う？」
  「アイデア出して」など。現状の spec / PLANS.md を踏まえた提案を作り、承認後に spec ドラフト作成と
  PLANS.md §10 への TODO 追記まで行う（Issue 起票は issue-sync の責務）。
---

# Skill: feature-proposal

新機能の提案 → spec ドラフト → PLANS.md 反映を段階的に行う。
**提案が承認されるまで、ファイルへの書き込みは一切しない。**

## このプロダクトの前提（提案の制約条件）

- セルフホスト・**単一ユーザー**の家庭内在庫管理。公開機能・マルチテナントは対象外
- **バックエンドサーバーなし**。Supabase クライアント直 + RLS。
  外部 API が必要なら Supabase Edge Functions（例: barcode-lookup）
- モバイルファースト。キッチン・買い物中の片手操作が主
- 価値の軸: **食品ロス削減・買い忘れ/二重購入の防止・記録の手間最小化**

この制約に反する提案（例: 家族間共有のリアルタイム同期サーバー）は、
制約内に収まる代案に変形するか、提案しない。

## Step 1. 現状把握

1. `PLANS.md` を読む — 既存 TODO・Backlog と被る提案をしないため（§10 とバックログを確認）
2. `docs/specs/overview.md` と関連 feature spec を読む
3. `docs/specs/database.md` — 既存テーブルで賄えるか、新テーブルが要るか

## Step 2. 提案を作る

1 機能につき以下のフォーマットで提示する。複数案を求められたら 3〜5 案、
各案はこのフォーマットの短縮版（課題・解決策・工数）で出し、深掘りする案を選んでもらう。

```markdown
## 提案: <機能名>

### 課題（いま何が不便か）

（このアプリの実際の利用シーンに即して書く）

### 解決策

（ユーザーから見える振る舞い。UI のラフ説明を含む）

### スコープ

- やること: ...
- やらないこと: ...（意図的に外すものを明記）

### データへの影響

- 既存テーブルで可 / 新テーブル `xxx` が必要（カラム概要）
- RLS・削除動作（CASCADE / SET NULL）の方針

### 技術ポイント

- Edge Function の要否、オフライン時の扱い、通知との関係 など

### 工数目安

S（〜半日）/ M（1〜2日）/ L（3日〜）

### Phase 提案

v1.1 / v1.2 / v1.3 / Backlog のどこに入れるべきか + 理由
```

## Step 3. 承認後 — spec ドラフトを書く

`docs/specs/features/<kebab-name>.md` を新規作成する。
**既存 spec（例: `docs/specs/features/pwa.md`）の見出し構成を踏襲する**:

```markdown
# Feature Spec: <名前>

## 概要

## スコープ判断

## ユーザーストーリー

## 実装方針

## データ

## エラー

## <phase> 範囲

## Backlog
```

- 実装方針にはコンポーネント配置（Atomic Design 層）と hooks の置き場所まで書く
- データ節は `docs/specs/database.md` の書式（削除動作の表など）に合わせる
- CLAUDE.md の Specs 一覧に 1 行追加する

## Step 4. PLANS.md へ TODO を追記する

`PLANS.md` §10 の該当 Phase 見出し配下に、実装可能な粒度でタスクを分解して追記する。

```markdown
- [ ] <タスク（1 PR で完結する粒度）>
```

- **`<!-- issue:#NN -->` は付けない**。Issue 起票は issue-sync スキルの責務
  （追記後に「Issue 化する？」と提案するのはよい）
- タスクは DB → hooks → UI → テスト の依存順に並べる
- 決定に至った重要な判断（スコープ外にしたもの等）は PLANS.md の決定ログにも追記する

## Step 5. 報告

- 提案の要約、作成/変更したファイル一覧、次のアクション
  （issue-sync 実行、実装開始の指示待ち）を報告する

## やってはいけないこと

- 承認前の spec 作成・PLANS.md 変更
- 既存 Backlog と重複する提案（Step 1 を飛ばさない）
- 「バックエンドを立てれば簡単」系の、制約を無視した提案
- 工数・Phase を書かない提案（判断材料にならない）
