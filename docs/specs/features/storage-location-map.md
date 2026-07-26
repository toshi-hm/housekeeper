# Feature Spec: Storage Location Photo Map

## 概要

保管場所（`storage_locations`）に写真を1枚登録し、その写真上にアイテムの収納位置を
ピンとして重ねて表示する「収納マップ」機能（#574）。「在庫があることは分かるが、
棚のどこにあるか思い出せない」という物理的な検索コストを解消する。

`item-images`（アイテムそのものの写真、`docs/specs/features/storage.md`）とは別軸の情報で、
混同しない。

## ユーザーストーリー

- 保管場所（設定 > 保管場所管理）に写真を1枚登録できる
- 収納マップ画面で、写真上にその保管場所のアイテムがピンとして表示される。ピンをタップすると
  アイテム詳細へ遷移する
- アイテム編集時、保管場所に写真が登録されていれば、任意で写真上をタップして収納位置を指定できる
- 位置指定は任意。写真が未登録、またはピン未設定のアイテムは常にリスト表示でフォールバックする
- アイテム詳細画面から、写真が登録された保管場所であれば収納マップへ遷移できる

## データ

- `storage_locations.photo_path text null` — Storage バケット `location-photos` のオブジェクトキー
- `items.pin_x numeric(4,3) null` / `items.pin_y numeric(4,3) null` — 保管場所の写真上の相対位置
  （左上を `(0, 0)`、右下を `(1, 1)` とする）。`0 <= 値 <= 1` の check 制約あり
- 保管場所を変更した場合、`ItemForm` は `pin_x`/`pin_y` を自動的にクリアする
  （別の保管場所の写真に対する位置指定を引き継がないため）

## 画面・コンポーネント

| コンポーネント       | 分類     | 役割                                                              |
| -------------------- | -------- | ----------------------------------------------------------------- |
| `LocationPin`        | atom     | 写真上の1ピン（相対座標→絶対配置に変換）                          |
| `LocationPinPicker`  | molecule | 写真タップでピン位置を指定（`ItemForm` から利用）、解除ボタン併設 |
| `StorageLocationMap` | organism | 写真+ピン一覧+フォールバックリストの収納マップ本体                |

| ルート                         | 役割                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `/_auth/settings/locations`    | 保管場所管理（既存）。行ごとに写真の登録/変更/削除、収納マップへのリンクを追加 |
| `/_auth/locations/$locationId` | 収納マップ（新規）。写真+ピン+フォールバックリストを表示                       |

`ItemForm` の保管場所選択の直下に、選択中の保管場所が写真を持つ場合のみ `LocationPinPicker` を表示する。
アイテム詳細画面では、保管場所に写真が登録されている場合のみ「マップで見る」ボタンを表示する。

## フォールバック（アクセシビリティ）

写真が未登録、または位置未指定のアイテムのために、`StorageLocationMap` は常にリスト表示を併設する
（視覚に依存しないアクセスを担保、`docs/specs/accessibility.md` の方針と整合）。

## API（hook）

| hook                                                                   | 機能                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `useSignedLocationPhoto(photoPath)`                                    | 保管場所写真の signed URL 取得                                                           |
| `uploadLocationPhoto({ locationId, file, oldPhotoPath, queryClient })` | 写真アップロード + `storage_locations.photo_path` 更新（DB更新成功後にのみ旧写真を削除） |
| `deleteLocationPhoto(locationId, photoPath, queryClient)`              | 写真削除（`photo_path` を null にしてから Storage オブジェクトを削除）                   |

アイテムの `pin_x`/`pin_y` は既存の `useItems` の作成/更新（`ItemFormValues`）経由で保存する。専用の
hook は設けない。

## Storage

### バケット `location-photos`

- 種別: **private**
- パス規約: `<user_id>/<location_id>.<ext>`（`ext` は `webp` / `jpg` / `png`）
- アクセス: `supabase.storage.from('location-photos').createSignedUrl(path, 3000)` を
  `useSignedLocationPhoto` 経由で取得
- アップロード上限: 5 MB（`ImageUploader` で共通検証、`item-images` と同じ制約を流用）
- RLS ポリシーは `item-images`（`docs/specs/database.md` Storage 節）と同じ所有者チェックパターン

## v1 範囲（本Issue #574 の実装範囲）

- 保管場所への写真登録（設定画面）
- `ItemForm` での任意のピン位置指定
- 収納マップ画面（写真+ピン+フォールバックリスト）
- アイテム詳細からの収納マップへの導線

## Backlog

- 複数写真（保管場所内の複数の棚・引き出しごとに写真を分ける）
- ピンのドラッグ&ドロップによる位置修正（現状はタップし直しのみ）
- 収納マップ上での複数アイテム同時選択・一括移動
