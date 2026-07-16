# Visual Regression Testing (VRT) 方針

本プロジェクトの VRT の選定理由と運用方針をまとめる（#290）。

## 現状（既存）: Storybook + storycap + reg-cli

`.github/workflows/vrt.yml` で以下を実行している。

- `build-storybook` で現ブランチと base ブランチの Storybook をビルド
- `storycap` で各 Story のスクリーンショットを取得
- `reg-cli` で base と比較し、差分レポート（HTML / JSON）を生成して PR にコメント

### メリット

- **完全無料・自己ホスト**: 外部 SaaS に依存しない。スクリーンショットや比較は GitHub Actions 内で完結
- **データを外部に出さない**: Storybook ビルドや画像が第三者サービスに送信されない
- **追加のシークレット不要**

### デメリット

- **ベースライン管理が手動**: base ブランチを毎回ビルドして比較するため CI 時間が長い（Storybook を 2 回ビルド）
- **レビュー UI がない**: 差分は HTML レポート（Artifact）で確認。承認/却下のワークフローがなく、意図的な変更の「ベースライン更新」が煩雑
- **レンダリングのブレに弱い**: フォント・アニメーション等で false positive が出やすく、しきい値調整が必要
- **並列化・ブラウザ横断が弱い**

## 提案: Storybook + Chromatic

`.github/workflows/chromatic.yml` を追加し、`chromaui/action` で Storybook を Chromatic に公開する。

### メリット

- **専用のレビュー UI**: Before/After をブラウザ上で並べて比較し、ワンクリックで承認/却下。承認した状態が次回のベースラインになる（手動のベースライン管理が不要）
- **TurboSnap**: 変更に影響する Story のみスナップショットを撮るため高速・低コスト
- **ブランチ/PR を意識したベースライン**: マージ先に応じたベースライン解決を自動で行う
- **クロスブラウザ / 複数ビューポート**を SaaS 側で実行
- Storybook 公式チームが提供しており Storybook との統合がスムーズ

### デメリット

- **外部 SaaS への依存**: Storybook（UI のスナップショット）が Chromatic に送信される。本リポジトリは公開情報のみ・単一ユーザーの自宅アプリのため実害は小さいが、依存先が増える
- **無料枠の制約**: Free プランは月 5,000 スナップショット。TurboSnap 併用で通常運用なら十分だが、超過時は課金が発生し得る
- **`CHROMATIC_PROJECT_TOKEN` の管理が必要**

## 決定 / 運用方針

1. **Chromatic をビジュアルレビューの主軸**として導入する（本 PR）。
   - `chromatic.yml` は `CHROMATIC_PROJECT_TOKEN` が未設定なら自動スキップするため、トークン未設定でも CI は壊れない。
   - `exitZeroOnChanges: true` とし、差分があっても CI は赤にせず Chromatic 上のレビューで承認する運用とする。
2. **当面は既存の reg-cli（`vrt.yml`）も残す**。Chromatic のベースラインが安定し、運用に問題がないと確認できたら `vrt.yml`・`storycap`・`reg-cli` を撤去する（フォローアップ）。

### セットアップ手順

1. [chromatic.com](https://www.chromatic.com/) でプロジェクトを作成し、Project Token を取得。
2. リポジトリの Secrets に `CHROMATIC_PROJECT_TOKEN` を登録。
3. 以降、`main` 以外への push で `chromatic.yml` が実行され、Chromatic 上に結果が表示される。
4. ローカル実行: `bun run chromatic`（要 `CHROMATIC_PROJECT_TOKEN` 環境変数）。
