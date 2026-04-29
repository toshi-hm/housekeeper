# Feature Spec: Inventory

## 概要

家庭内の備品・食料品を **アイテム単位** で記録・更新・消費する、housekeeper の中核機能。
バーコード / 画像 / 期限 / マスタ機能と密接に連動する。

## 数量モデル（重要）

| 列                 | 意味               | 例           |
| ------------------ | ------------------ | ------------ |
| `units`            | 残点数             | 牛乳 3 本    |
| `content_amount`   | 1 点あたりの内包量 | 1000.00      |
| `content_unit`     | 単位               | `mL`         |
| `opened_remaining` | 開封中 1 点の残量  | 350.00（mL） |

- `units = 3, content_amount = 1000, content_unit = 'mL', opened_remaining = 350`
  → 「1L 牛乳 3 本うち、1 本目が 350mL 残っている」
- `opened_remaining = null` は **すべて未開封**

### 表示トグル

ユーザーは item ごとに以下を切替可能（atom: `UnitToggle`）:

- **総量表示**: `2350 mL`（= `2 * 1000 + 350`）
- **点数表示**: `2 本 + 350 mL`

デフォルトは `user_settings.default_unit` と一致する単位での総量表示。

### 消費アルゴリズム

入力: `delta_amount: number`, `delta_unit: text`（item の `content_unit` と一致）

```
remaining = (units * content_amount) - (content_amount - (opened_remaining ?? content_amount))
        ≒ 在庫総量
delta_amount > remaining → エラー（在庫不足）

if opened_remaining is null:
    opened_remaining = content_amount

if delta_amount <= opened_remaining:
    opened_remaining -= delta_amount
else:
    rest = delta_amount - opened_remaining
    units -= 1                       -- 1 本目を使い切った
    full_consumed = floor(rest / content_amount)
    units -= full_consumed
    new_remaining = content_amount - (rest - full_consumed * content_amount)
    opened_remaining = new_remaining if new_remaining < content_amount else content_amount

if opened_remaining == 0:
    units -= 1
    opened_remaining = null   -- 全部未開封状態に戻る or 履歴扱い

if units < 0:
    エラー（バリデーション側で防ぐ）
```

ロジックは `src/lib/consume.ts` に純関数で実装し、`bun test` でテストする。

## ユーザーストーリー

- 商品を追加できる（手入力 / バーコード）
- 商品を編集できる
- 商品を削除できる（確認ダイアログ必須）
- 商品を「使う」操作で消費量を減らせる
- 残量・期限・カテゴリ・場所が一覧で見える
- 名前・バーコード・カテゴリ・場所・期限ステータスで絞り込める
- 期限近い順 / 購入日順 / 作成日順でソートできる
- 「使い切り」状態の item を一覧から隠せる

## 画面・動線

| ルート                         | 役割                                           |
| ------------------------------ | ---------------------------------------------- |
| `/_auth/`                      | ダッシュボード（一覧・検索・フィルタ・ソート） |
| `/_auth/items/new`             | 追加（手入力 + バーコードスキャナ起動）        |
| `/_auth/items/$itemId`         | 詳細（残量・期限・操作ボタン・履歴）           |
| `/_auth/items/$itemId/edit`    | 編集                                           |
| `/_auth/items/$itemId/consume` | 消費フォーム（モーダルではなく独立ルート）     |

## コンポーネント

- organisms: `ItemList`, `ItemForm`, `ItemDetailView`, `ConsumeForm`
- molecules: `ItemCard`, `QuantityInput`, `ImageUploader`, `FilterChips`, `ConfirmDialog`
- atoms: `ExpiryBadge`, `QuantityDisplay`, `UnitToggle`, `ItemImage`, `EmptyState`

## データ

`items` テーブル + `consumption_logs` + `categories` + `storage_locations`。
スキーマは `docs/specs/database.md` 参照。

## API（hook）

| hook                 | 機能                     |
| -------------------- | ------------------------ |
| `useItems(filters?)` | 一覧（filter/sort 適用） |
| `useItem(id)`        | 詳細                     |
| `useCreateItem`      | 追加                     |
| `useUpdateItem(id)`  | 編集                     |
| `useDeleteItem`      | 削除                     |
| `useConsumeItem(id)` | 消費（楽観更新）         |

実装は `src/hooks/useItems.ts` を中心に、消費は `src/hooks/useConsumeItem.ts`、純粋ロジックは `src/lib/consume.ts`。

## バリデーション

- `name`: 必須・1〜120 文字
- `units`: 0 以上の整数
- `content_amount`: 0 より大きい数値、小数 2 桁まで
- `content_unit`: `user_settings` の許可単位リストに含まれること
- `opened_remaining`: `null` または `0 <= x <= content_amount`
- `expiry_date`: 過去日でも許容（既存履歴入力のため）

## エラー

- 在庫不足での消費: フォーム側でブロック + 「最大量まで一括消費」ボタンで救済
- 削除確認のキャンセル: 何もしない
- ネットワーク失敗: トースト + リトライ

## v1 範囲

- 既存 CRUD を新スキーマで全置換
- 消費機能 + 履歴記録
- フィルタ / ソート
- 削除確認
- 「使い切り」状態の表示制御

## Backlog

- 単位換算（mL ↔ L、g ↔ kg を自動）
- 複数バーコード読取での一括追加
- バーコードと未紐付け item のサジェスト
