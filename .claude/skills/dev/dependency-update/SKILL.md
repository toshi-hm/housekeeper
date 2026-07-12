---
name: dependency-update
description: >-
  Use when updating dependencies — 「依存を更新して」「ライブラリを最新にして」「脆弱性を直して」
  「メジャーバージョン上げて」「renovate/dependabot の PR を見て」など。影響調査 → 段階的更新 →
  検証、の安全な依存更新を行う開発系汎用スキル。
---

# Skill: dependency-update

依存ライブラリを安全に更新する。**一括で上げて祈らない**ための型。

## Step 0. プロジェクト把握

- パッケージマネージャを lockfile で特定する（bun.lock / package-lock.json / yarn.lock / pnpm-lock.yaml）。
  **lockfile と違うマネージャを使わない**
- 検証手段の確認: テスト・lint・typecheck・ビルドのコマンド、E2E の有無
- 更新の目的を確認: 脆弱性対応 / 新機能が要る / 定期メンテ — 目的で急ぎ度と範囲が変わる

## Step 1. 現状を棚卸しする

```bash
<pm> outdated        # 更新可能な一覧（bun outdated / npm outdated 等）
<pm> audit           # 既知脆弱性（あれば優先度が上がる）
```

更新候補を分類する:

| 分類                       | リスク | 進め方                             |
| -------------------------- | ------ | ---------------------------------- |
| patch（x.y.Z）             | 低     | まとめて更新してよい               |
| minor（x.Y.z）             | 中     | 数個ずつ。フレームワーク系は単独で |
| major（X.y.z）             | 高     | **1 つずつ**。changelog 必読       |
| フレームワーク・ビルド基盤 | 最高   | 単独 PR + 動作確認を厚めに         |

## Step 2. 更新する（リスク低 → 高の順）

### 共通手順（1 バッチごと）

1. 更新する
2. lockfile の差分を確認する（意図しない transitive の大変動がないか）
3. 検証を回す: install → typecheck → lint → test → build
4. 通ったらバッチ単位でコミット（`chore(deps): ...`）。**戻せる単位を保つ**

### major 更新の追加手順

1. **リリースノート / migration guide を読む**（推測で API を書き換えない。
   ドキュメント取得手段（Context7 / 公式サイト）があれば現行版の情報を引く）
2. breaking changes を列挙し、影響箇所を `rg` で洗い出してから書き換える
3. 型エラー・deprecation warning をゼロにする（「動くけど警告」は次の major で死ぬ)
4. その依存が絡む機能を実際に動かして確認する（テストがない領域は手動確認を報告に明記)

## Step 3. 報告

```markdown
## 依存更新レポート

### 更新済み

| パッケージ | 前 → 後 | 種別 | 備考（breaking 対応など） |

### 見送り（理由付き）

- foo v5: peer dependency が React 20 要求のため（現行 19）

### 検証

- typecheck / lint / test / build: ✅
- 手動確認: <した内容 or 未実施の明記>
```

## 判断に迷うケース

- **peer dependency 競合**: 無理に `--force` しない。競合の構図を報告して指示を仰ぐ
- **メンテ停止パッケージ**: 更新ではなく代替ライブラリへの移行を提案する
- **lockfile のみの更新**（transitive の脆弱性対応）: `<pm> update <pkg>` で最小限に留める
- CLAUDE.md 等に「常に最新を入れる」等のプロジェクト方針があればそれに従う

## やってはいけないこと

- major を含む全部入り一括更新（壊れたとき原因が特定できない）
- lockfile を無視した更新・lockfile の手編集・むやみな削除再生成
- changelog を読まずに API を推測で書き換える
- `--force` / `--legacy-peer-deps` での握りつぶし（使うなら理由を報告に明記）
- 検証なしのコミット（最低限 install → build が通ることを確認する）
