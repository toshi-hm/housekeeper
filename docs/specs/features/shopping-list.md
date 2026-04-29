# Feature Spec: Shopping List

## 概要

買い物予定リスト。自由入力で追加できるほか、既存 item の「補充」操作からも自動追加できる。
購入完了で `items` 行を生成して在庫に反映する。

## ユーザーストーリー

- 自由入力で買うものを追加できる
- 既存 item の詳細から「補充」ボタンで shopping list に追加できる
- 行を購入済みにすると、数量・単位・期限を入力するモーダルが開き、`items` 行が作成される
- 購入済み行はアーカイブとして残る（履歴）

## 画面

| ルート            | 役割                             |
| ----------------- | -------------------------------- |
| `/_auth/shopping` | 一覧（planned / purchased タブ） |

主要 organism: `ShoppingList`, `ShoppingForm`, `PurchaseDialog`
主要 molecule: `ShoppingRow`

## データ

`shopping_list_items`（`docs/specs/database.md` 参照）

## API（hook）

| hook                          | 機能                                        |
| ----------------------------- | ------------------------------------------- |
| `useShoppingList(status)`     | 一覧                                        |
| `useUpsertShoppingItem()`     | 追加 / 編集                                 |
| `useDeleteShoppingItem(id)`   | 削除                                        |
| `usePurchaseShoppingItem(id)` | 購入完了（item 作成 + 行を `purchased` に） |

`usePurchaseShoppingItem` は **トランザクション的に**:

1. `items` に行を作成（フォーム入力値）
2. `shopping_list_items` を `status='purchased'`, `purchased_at=now()`, `created_item_id=新id` に更新

両方のテーブルに `user_id` が乗っているので RLS は問題なし。失敗時はトーストで通知し、片方だけ成功した場合のリカバリ手順も `notes` に残せる UI を用意する。

## バリデーション

- `name`: 必須、1〜120 文字
- `desired_units`: 1 以上の整数

## エラー

- 購入完了後に items 作成失敗 → ロールバック扱いでトースト + shopping 行は `planned` のまま

## v1.1 範囲

- 自由入力 + 補充
- 購入完了で items 化
- planned/purchased タブ

## Backlog

- 共有リスト（家族）
- 定期購入の自動追加
- 通知（買い忘れ）
