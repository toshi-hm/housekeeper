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
5. Edge Function `barcode-lookup` が外部 API（Open Food Facts など）を叩く
6. 成功なら `ProductInfo` を返す → フォーム自動入力
7. 失敗 / 未ヒットでもバーコード文字列はフォームに残す

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

## Backlog

- 複数バーコード一括読取
- 履歴に基づく予測補完（同じバーコードの再読取 → 既存 item を提案）
