# Feature Spec: Barcode

## 概要

カメラからバーコードを読み取り、商品名・カテゴリ・画像を自動入力する。
外部 API への問い合わせは Supabase Edge Function `barcode-lookup` 経由（CORS 回避と API キー秘匿）。

## ライブラリ

- `@zxing/browser`（既存）
- 一覧視野形式: EAN-13 / EAN-8 / UPC-A / UPC-E / Code128 / Code39 / QR

## ユーザーストーリー

- 「Add」→「Scan」でカメラを起動できる
- カメラ権限が無い / 拒否時はメッセージ + 手入力導線が表示される
- 読み取りに失敗した時はリトライまたは手入力に戻れる
- 読み取れた商品情報がフォームに反映される
- 商品が API でヒットしなくても、バーコード文字列だけ取り込んで手入力で保存できる

## 画面・動線

| 場所                           | 役割                        |
| ------------------------------ | --------------------------- |
| `ItemNewPage` の「Scan」ボタン | スキャナを全画面で起動      |
| `BarcodeScanner` organism      | カメラ + 読取 + リトライ UI |
| 読取後                         | `ItemForm` に値を流し込む   |

## 処理フロー

1. ユーザーが Scan を押す
2. `getUserMedia` でカメラ取得（背面優先）
3. `BrowserMultiFormatReader` でフレーム解析
4. 値が取れたら `useBarcodeLookup` に渡す
5. **DB優先**: `items` テーブルをバーコードで検索（`deleted_at IS NULL`）
   - ヒットした場合 → 商品名・画像（署名付きURL）を返す（外部 API は呼ばない）
   - 未ヒットの場合 → 次ステップへ
6. Edge Function `barcode-lookup` が外部 API（Yahoo Shopping など）を叩く
7. 成功なら `ProductInfo` を返す → フォーム自動入力
8. 失敗 / 未ヒットでもバーコード文字列はフォームに残す

## API

```
POST /functions/v1/barcode-lookup
body: { barcode: string }
res:  { product: { name, category, image_url } | null }
```

Edge Function 実装: `supabase/functions/barcode-lookup/index.ts`

## エラー

- カメラ権限拒否 → メッセージ + 手入力ボタン
- カメラデバイスなし → 同上
- 連続読み取り失敗（30 秒超） → リトライ / キャンセル
- Edge Function 失敗 → バーコード文字列だけ反映 + 手入力

## v1 範囲

- 既存実装の polish（カメラデバイス選択 UI、再試行）
- 読取失敗時のフォールバック導線整備
- `barcode-lookup` の戻り値にカテゴリ候補を入れる（マッチがあれば）

## 実装済み（v1）

- DB優先ルックアップ: 同じバーコードで過去登録済みのアイテムがあれば外部 API を叩かずにその商品名・画像を返す

## Backlog

- 複数バーコード一括読取

## 関連: CORS回避パターンの再利用

外部APIをCORS制約なく叩くための「Edge Function経由・authチェック・キー未設定時はソフトフェイル」という
本spec の構成は `supabase/functions/recipe-suggest`（期限が近いアイテムの外部レシピ提案、#461。
`docs/specs/features/expiry-alert.md` 参照）でも同じ形で踏襲している。新しく外部APIを呼ぶ機能を追加する際は
このパターンに倣うこと。

## 外部API契約監視（nightly monitor）

Yahoo!ショッピング商品検索APIはベンダー管理の無料/準無料APIであり、レスポンス形状の変更・
フィールド廃止・レート制限仕様変更が予告なく起こり得る。既存テスト（`validation.test.ts`）は
モックしたレスポンスのパース処理のみを検証しており、実際のAPIが今もその形状で応答しているかは
別途確認する必要がある。

- 監視スクリプト: `scripts/api-contract-monitor.ts`（bun）
  - Yahoo!ショッピング商品検索APIへ軽量な実リクエストを送信し、レスポンスをZodスキーマで検証
  - HTTP 429 / 5xx やスキーマ不一致を検知した場合は失敗として扱う
- ワークフロー: `.github/workflows/api-contract-monitor.yml`（毎日 03:00 JST 実行 + 手動実行可）
- 必要な GitHub Actions Secret: `YAHOO_SHOPPING_APP_ID`（Supabase Edge Function 側の
  `supabase secrets set YAHOO_SHOPPING_APP_ID=...` と同じ値・同じ名前）
- Secret 未設定（例: フォーク環境）の場合はチェックをスキップし、明示的なメッセージを出して
  正常終了する（クラッシュしない）
- 異常検知時はワークフロー実行自体を失敗させる（Issue自動起票はスコープ外。単一ユーザー
  プロジェクトのため、失敗したscheduled runそのものが十分な可視化シグナルと判断）
