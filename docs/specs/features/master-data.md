# Feature Spec: Master Data (Categories / Storage Locations / Custom Units)

## 概要

カテゴリと保管場所を **ユーザーごとのマスタテーブル** で管理する。
従来は items 内の自由文字列だったため、表記揺れ（"冷蔵庫" / "れいぞうこ"）が発生していた。
マスタ化により集計と絞り込みの精度を上げる。

同様に、`items.content_unit`（単位）もプリセット（`CONTENT_UNITS`）だけでなく
ユーザー独自の単位をマスタ化して追加できる（`custom_units`、v1.1、#420）。

## ユーザーストーリー

- カテゴリを追加・改名・削除できる
- 保管場所を追加・改名・削除できる
- マスタを削除しても紐づく item は消えない（`SET NULL`）
- ItemForm で Select として選択できる
- 一覧で絞り込みチップとして表示される
- （カスタム単位）独自の単位（缶・パック・食・錠・ロール など）を追加・削除できる
- （カスタム単位）ItemForm の単位選択で、プリセットと合わせて選択・その場で追加できる

## 画面

| ルート                          | 役割                                               |
| ------------------------------- | -------------------------------------------------- |
| `/_auth/settings/categories`    | カテゴリ一覧・追加・編集・削除                     |
| `/_auth/settings/locations`     | 保管場所一覧・追加・編集・削除                     |
| `/_auth/settings`（インライン） | 「カスタム単位」セクション: 単位の一覧・追加・削除 |

`MasterDataList` / `MasterDataForm` を共通コンポーネントとして実装し、画面は薄いラッパとする。
カスタム単位は改名（update）を持たない単純なマスタのため、専用ルートを作らず
`_auth.settings.tsx` 内にインラインのセクションとして実装する。

## データ

`categories` / `storage_locations` / `custom_units`（`docs/specs/database.md` 参照）。
いずれも `(user_id, name)` で UNIQUE。

`custom_units` は `categories` / `storage_locations` と異なり、`items.content_unit` から
外部キー参照されない（`content_unit` は単なる text 列）。そのため:

- 削除時の「使用中チェック」は不要（削除しても既存アイテムの表示に影響しない）
- 改名（update）は提供しない — 名前を変えたい場合は削除して追加し直す

## API（hook）

| hook                                                                                    | 機能                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------- |
| `useCategories()`                                                                       | 一覧                                      |
| `useUpsertCategory()`                                                                   | 追加・編集                                |
| `useDeleteCategory(id)`                                                                 | 削除（FK は SET NULL）                    |
| `useStorageLocations()` / `useUpsertStorageLocation()` / `useDeleteStorageLocation(id)` | 同上                                      |
| `useCustomUnits()`                                                                      | 一覧                                      |
| `useCreateCustomUnit()`                                                                 | 追加                                      |
| `useDeleteCustomUnit()`                                                                 | 削除（FK ではないため使用中チェック不要） |

## バリデーション

- `name`: 必須、1〜40 文字、ユーザー内で重複不可（`custom_units` も同様）
- カスタム単位名は前後空白を除いて保存し、プリセット単位と同名にはできない
- `color`: hex 形式（任意）
- `icon`: lucide のアイコン名（任意）

## エラー

- 既に存在する名前: フォームエラー「同名のカテゴリがあります」（カスタム単位は「同名のカスタム単位があります」）
- 削除確認: ConfirmDialog
- ItemForm の単位選択でプリセット単位（`CONTENT_UNITS`）を削除しようとした場合はエラー
  「プリセット単位は削除できません」（そもそも `custom_units` に存在しないため削除不可）

## v1 範囲

- 両マスタ + 管理画面 + ItemForm の Select 連携
- 既存 item の `category` / `storage_location`（自由文字列）を **初回マイグレーション** でユニーク値ごとにマスタ化し、items を `category_id` / `storage_location_id` に置換

## v1.1: カスタム単位（#420）

- `custom_units` テーブル + 設定画面「カスタム単位」セクション（一覧・追加・削除）
- ItemForm の単位ドロップダウンは `CONTENT_UNITS`（プリセット）+ `custom_units`（ユーザー定義）を
  マージして表示。ドロップダウン内の「+ 新しい単位を追加」からその場で追加でき、追加した単位が
  即座に選択される
- プリセットと同名のカスタム単位が存在する場合は、ドロップダウン上ではプリセット側を優先し重複表示しない
- 既存 item が参照していたカスタム単位を削除しても、ItemForm はコピー済みの単位文字列を
  引き続き表示・保持する

## Backlog

- カテゴリツリー（親子関係）
- カスタム単位の改名（update）・並び替え

保管場所のレイアウト図（写真+ピンでの収納位置の可視化）は
`docs/specs/features/storage-location-map.md`（#574）で実装済み。
