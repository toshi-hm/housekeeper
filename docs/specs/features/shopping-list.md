# Feature Spec: Shopping List

## 概要

買い物予定リスト。自由入力で追加できるほか、既存 item の「補充」操作からも自動追加できる。
購入完了で `items` 行を生成して在庫に反映する。

## ユーザーストーリー

- 自由入力で買うものを追加できる
- 既存 item の詳細から「補充」ボタンで shopping list に追加できる
- 行を購入済みにすると、数量・単位・期限を入力するモーダルが開き、`items` 行が作成される
- 「購入済みをクリア」を実行すると、購入済み行は完全削除ではなく `shopping_list_archive` へ
  アーカイブされ、設定 > 購入履歴から「いつ・何を・いくつ」買ったか振り返れる（#365）
- 履歴の各行から「再購入」でショッピングリスト（planned）に戻せる

## 画面

| ルート                             | 役割                             |
| ---------------------------------- | -------------------------------- |
| `/_auth/shopping`                  | 一覧（planned / purchased タブ） |
| `/_auth/settings/purchase-history` | 購入履歴（アーカイブ、日付別）   |

主要 organism: `ShoppingList`, `ShoppingForm`, `PurchaseDialog`
主要 molecule: `ShoppingRow`, `PurchaseHistoryRow`

## データ

`shopping_list_items` / `shopping_list_archive`（`docs/specs/database.md` 参照）

## API（hook）

| hook                           | 機能                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `useShoppingList(status)`      | 一覧                                                                     |
| `useUpsertShoppingItem()`      | 追加 / 編集（購入履歴からの「再購入」もこの hook を再利用する）          |
| `useDeleteShoppingItem(id)`    | 削除                                                                     |
| `usePurchaseShoppingItem(id)`  | 購入完了（item 作成 + 行を `purchased` に）                              |
| `useDeleteAllPurchasedItems()` | 「購入済みをクリア」（`shopping_list_archive` へアーカイブしてから削除） |
| `usePurchaseHistory()`         | 購入履歴一覧（`shopping_list_archive`、`archived_at desc`）              |

`usePurchaseShoppingItem` は **トランザクション的に**:

1. `items` に行を作成（フォーム入力値）
2. `shopping_list_items` を `status='purchased'`, `purchased_at=now()`, `created_item_id=新id` に更新

両方のテーブルに `user_id` が乗っているので RLS は問題なし。失敗時はトーストで通知し、片方だけ成功した場合のリカバリ手順も `notes` に残せる UI を用意する。

### 購入済みクリア → アーカイブ（#365）

`useDeleteAllPurchasedItems()` は `archive_purchased_shopping_items` RPC を呼び出す。RPC内の
単一トランザクションで `status='purchased'` の行を `DELETE ... RETURNING` し、その結果を
`shopping_list_archive` へinsertする。insert失敗時はdeleteもrollbackされる。並行実行時も
各元行を一度しかdeleteできないため二重アーカイブにならず、成功後の再実行は0件処理となる。
`archived_at` は同一RPC内の全行で同じ時刻を使う。

購入履歴ページ（`/_auth/settings/purchase-history`）は `usePurchaseHistory()` で
`shopping_list_archive` を `archived_at desc` で取得し、`archived_at` のローカル日付（日単位）で
グループ化して表示する。各行の「再購入」ボタンは `useUpsertShoppingItem()` を呼び出し、
既存の planned 行との重複統合ロジック（`findDuplicatePlannedItem`）をそのまま利用する。

## バリデーション

- `name`: 必須、1〜120 文字
- `desired_units`: 1 以上の整数

## エラー

- 購入完了後に items 作成失敗 → ロールバック扱いでトースト + shopping 行は `planned` のまま

## v1.1 範囲

- 自由入力 + 補充
- 購入完了で items 化
- planned/purchased タブ

## v1.2 範囲

- 購入済みクリア時のアーカイブ保存（`shopping_list_archive`）
- 設定 > 購入履歴ページ（日付別グループ表示、再購入）

## Backlog

- 共有リスト（家族）
- 定期購入の自動追加
- 通知（買い忘れ）
