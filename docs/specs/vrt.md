# Visual Regression Testing (VRT) 方針

本プロジェクトの VRT の選定理由と運用方針をまとめる（#290）。

## 現状: Storybook + Chromatic

`.github/workflows/chromatic.yml` で `chromaui/action` を使い、Storybook を Chromatic に公開している。

以前は自前実装の `storycap` + `reg-cli`（`.github/workflows/vrt.yml`）も並行稼働していたが、
Chromatic と全く同じトリガー条件で Storybook 全体を二重にスクリーンショットしており、
CI コストの重複と「どちらの差分が正か」というレビュー導線の分散を招いていたため、
Chromatic のベースラインが安定運用できることを確認した上で撤去した（#659）。

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

1. **Chromatic をビジュアルレビューの主軸**として導入する。
   - `chromatic.yml` は `CHROMATIC_PROJECT_TOKEN` が未設定なら自動スキップするため、トークン未設定でも CI は壊れない。
   - `exitZeroOnChanges: true` とし、差分があっても CI は赤にせず Chromatic 上のレビューで承認する運用とする。
2. **reg-cli（`vrt.yml`）・`storycap` は撤去済み**（#659）。Chromatic のベースラインが安定運用できることを確認した上で削除した。

### セットアップ手順

1. [chromatic.com](https://www.chromatic.com/) でプロジェクトを作成し、Project Token を取得。
2. リポジトリの Secrets に `CHROMATIC_PROJECT_TOKEN` を登録。
3. 以降、`main` 以外への push で `chromatic.yml` が実行され、Chromatic 上に結果が表示される。
4. ローカル実行: `bun run chromatic`（要 `CHROMATIC_PROJECT_TOKEN` 環境変数）。
