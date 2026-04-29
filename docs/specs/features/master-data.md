# Feature Spec: Master Data (Categories / Storage Locations)

## 概要

カテゴリと保管場所を **ユーザーごとのマスタテーブル** で管理する。
従来は items 内の自由文字列だったため、表記揺れ（"冷蔵庫" / "れいぞうこ"）が発生していた。
マスタ化により集計と絞り込みの精度を上げる。

## ユーザーストーリー

- カテゴリを追加・改名・削除できる
- 保管場所を追加・改名・削除できる
- マスタを削除しても紐づく item は消えない（`SET NULL`）
- ItemForm で Select として選択できる
- 一覧で絞り込みチップとして表示される

## 画面

| ルート | 役割 |
| --- | --- |
| `/_auth/settings/categories` | カテゴリ一覧・追加・編集・削除 |
| `/_auth/settings/locations` | 保管場所一覧・追加・編集・削除 |

`MasterDataList` / `MasterDataForm` を共通コンポーネントとして実装し、画面は薄いラッパとする。

## データ

`categories` / `storage_locations`（`docs/specs/database.md` 参照）。
両方 `(user_id, name)` で UNIQUE。

## API（hook）

| hook | 機能 |
| --- | --- |
| `useCategories()` | 一覧 |
| `useUpsertCategory()` | 追加・編集 |
| `useDeleteCategory(id)` | 削除（FK は SET NULL） |
| `useStorageLocations()` / `useUpsertStorageLocation()` / `useDeleteStorageLocation(id)` | 同上 |

## バリデーション

- `name`: 必須、1〜40 文字、ユーザー内で重複不可
- `color`: hex 形式（任意）
- `icon`: lucide のアイコン名（任意）

## エラー

- 既に存在する名前: フォームエラー「同名のカテゴリがあります」
- 削除確認: ConfirmDialog

## v1 範囲

- 両マスタ + 管理画面 + ItemForm の Select 連携
- 既存 item の `category` / `storage_location`（自由文字列）を **初回マイグレーション** でユニーク値ごとにマスタ化し、items を `category_id` / `storage_location_id` に置換

## Backlog

- カテゴリツリー（親子関係）
- 保管場所のレイアウト図
