# Feature Spec: Image Storage

## 概要

item の画像を Supabase Storage バケット `item-images` にアップロードする。
従来は `image_url` を URL 文字列で持っていたが、自前ホスティングと寿命管理が必要だった。
Storage に移行し、`items.image_path` でオブジェクトキーのみ保持する。

## ユーザーストーリー

- ItemForm で画像をドラッグ&ドロップまたはファイル選択でアップロードできる
- カメラから直接撮影してアップロードできる（`<input capture>`）
- アップロード前にプレビューが表示される
- 既存画像を差し替え・削除できる
- 一覧 / 詳細では Storage の signed URL から表示する

## 画面

- molecule: `ImageUploader`
  - 状態: empty / preview / uploading / error
- atom: `ItemImage`
  - `image_path` を受け取り、内部で signed URL を取得して表示
  - URL 失効前に再取得（TanStack Query で 50 分間キャッシュ）

## データ

- 新規 `items.image_path text`: `<household_id>/<item_id>.<ext>`
- 移行前 `image_path` は `<user_id>/<item_id>.<ext>` のまま保持される。移行中は旧パスの owner と参照行の household member が読み取りできる
- バケット `item-images` (private)

## 処理フロー（アップロード）

1. ユーザーがファイル選択
2. クライアント側でサイズ検証（≤ 5 MB）と種別検証（jpg/png/webp）
3. `canvas` で長辺 1280px に縮小 + webp 変換（変換後が小さい場合のみ採用し、WebP非対応環境では元フォーマットにフォールバック）
4. `household_members` から利用者の household_id を取得し、`<household_id>/<item_id>.<ext>` へ `supabase.storage.from('item-images').upload(path, file, { upsert: true })`
5. 成功なら `items.image_path` を更新してから旧形式のobjectを削除
   - DB更新失敗時は新しいobjectをrollbackし、既存の画像参照を維持する
6. 失敗ならフォーム下にエラー、ローカル State でリトライ可

## 処理フロー（表示）

1. `ItemImage` に `image_path` 渡す
2. `useSignedItemImage(path)` が `createSignedUrl(path, 3600)` を Query で取得
3. `<img>` の `src` に渡す
4. fallback: 取得失敗時はカテゴリアイコン

## API（hook）

| hook                         | 機能                                  |
| ---------------------------- | ------------------------------------- |
| `useUploadItemImage(itemId)` | アップロード + items.image_path 更新  |
| `useDeleteItemImage(itemId)` | バケットから削除 + image_path = null  |
| `useSignedItemImage(path)`   | signed URL を取得（50min キャッシュ） |

## RLS

`docs/specs/database.md` の Storage 節参照。新規オブジェクトは現在の household ID prefix に制限する。旧 user ID prefix は owner に加えて、現在の `items.image_path` が一致する household のメンバーに限り読み取り可能とし、書き込みは許可しない。

既存参照の一括移行は `scripts/migrate-household-storage.ts` で行う。最初は dry run を実施し、差分一覧とバックアップを確認した後、`--apply` 付きで Storage API copy → SHA-256 検証 → 旧パス条件付きDB更新 → 未参照確認 → 旧オブジェクト削除を行う。実行環境にだけ `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を設定し、service role key をブラウザやリポジトリへ保存しない。欠損 source、検証失敗、参照更新失敗では旧オブジェクトを削除しない。

## エラー

- サイズ超過: フォーム下にエラー
- 種別不正: 同上
- アップロード失敗: トースト + リトライボタン
- signed URL 取得失敗: フォールバックアイコン

## v1 範囲

- アップロード / 差し替え / 削除
- signed URL 表示
- サイズ制限とエラーハンドリング

## Backlog

- ~~画像縮小 / webp 変換（`canvas` で実装）~~ → 実装済み（`src/lib/imageCompress.ts`、`uploadItemImage` から呼び出し）
- 複数画像（ギャラリー）
- 画像から OCR で期限読み取り
