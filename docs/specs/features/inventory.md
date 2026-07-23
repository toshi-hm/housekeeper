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

## 低在庫アラート (#230)

在庫が少なくなったことを、期限切れとは別の軸でユーザーに知らせる仕組み。

- `items.minimum_stock`（任意入力、`null` = 未設定）: アイテムごとに「これ以下になったら知らせてほしい」
  しきい値を `units`（点数）で設定する。`ItemForm` の入力欄から設定・変更でき、未入力のままなら
  アラート対象外（既存アイテムは全て `null`）。
- 判定: `units <= minimum_stock`（`minimum_stock` が `null` のアイテムは対象外）。
- ダッシュボード（`/_auth/`）: 判定に該当するアイテムを検索・カテゴリ・場所・期限・在庫0非表示
  などの一覧フィルターにかかわらず対象として、低在庫バナー（件数・開閉可能な内訳・
  「まとめて買い物リストに追加」ボタン）を表示する。
- 消費ペースからの予測残日数に基づく警告（`user_settings.low_stock_forecast_days`、#392）は、
  この `minimum_stock` ベースの警告とは別軸で、同一アイテムが両方に載る場合は低在庫バナー側を
  優先し予測バナー側では重複表示しない（詳細は `docs/specs/features/stats.md` 参照）。

## 棚卸し（在庫確認） (#375)

賞味期限が遠い/存在しない備品（非常食・防災用品・季節品・医薬品など）は期限アラートが出ないため、
実在庫と DB 上の数量が乖離しやすい。定期的な物理確認（棚卸し）を促す仕組み。

- `items.last_verified_at`（timestamptz）: アイテム詳細ページの「✅ 在庫確認済み」ボタンを押すと
  現在時刻で更新される。押した後は「確認しました（日付）」の表示に切り替わる。
- 「未確認」判定（純関数 `isItemUnverified` in `src/types/item.ts`）:
  - `last_verified_at` が `null`（一度も確認されていない）かつ `created_at` から
    30 日以上経過（`STOCKTAKE_NEW_ITEM_GRACE_DAYS`、固定値）
  - または `last_verified_at` から `user_settings.stocktake_alert_days` 日以上経過
    （デフォルト 90 日 = `DEFAULT_STOCKTAKE_ALERT_DAYS`。設定でカスタマイズ可能）
- ダッシュボード（`/_auth/`）: `user_settings.stocktake_alert_enabled` が true のとき、
  期限バナー・低在庫バナーの下に「⚠️ N 件のアイテムは在庫確認が必要です」バナーを表示し、
  対象アイテムの一覧を開閉可能な詳細（`<details>`）で表示する。新規アイテムの固定30日猶予と
  確認済みアイテムの設定日数が混在するため、バナーには単一の日数を表示しない。検索・カテゴリ・
  場所・期限・在庫0非表示などの一覧フィルターにかかわらず、在庫が残る全アイテムから算出する。
- 設定ページ（`/_auth/settings`）「棚卸し」セクション:
  - 棚卸しアラートを有効にする（`stocktake_alert_enabled`、デフォルト OFF）
  - 未確認とみなすまでの日数（`stocktake_alert_days`、1〜365、デフォルト 90）

## ユーザーストーリー

- 商品を追加できる（手入力 / バーコード）
- 商品を編集できる
- 商品を削除できる（確認ダイアログ必須）
- 商品を「使う」操作で消費量を減らせる
- 残量・期限・カテゴリ・場所が一覧で見える
- 名前・バーコード・カテゴリ・場所・期限ステータスで絞り込める
- 期限近い順 / 購入日順 / 作成日順でソートできる
- 「使い切り」状態の item を一覧から隠せる
- 一覧をグリッド表示 / コンパクトなリスト表示に切り替え、選択を端末に保存できる
- 在庫データを CSV / JSON でエクスポートできる（詳細は `consumption-purchase.md` の「エクスポート」参照）
- 「定期購入」フラグとしきい値を設定でき、消費して在庫がしきい値以下になると
  ショッピングリストへ自動的に追加される（#353。詳細は `docs/specs/features/shopping-list.md` 参照）

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
- molecules: `ItemCard`, `ItemListRow`, `QuantityInput`, `ImageUploader`, `ImageLightbox`, `FilterChips`, `ConfirmDialog`
- atoms: `ExpiryBadge`, `QuantityDisplay`, `UnitToggle`, `ItemImage`, `EmptyState`, `ViewModeToggle`

## コスト管理（単価・在庫総額）

`item_lots.unit_price`（円単位の整数、任意入力）でロットごとの購入単価を記録できる（#342）。

- 入力: ロット追加フォーム（新規登録）／`PurchaseDialog`（買い物リストからの購入・追加購入時）。
  いずれも `ItemForm` の「購入単価」フィールドで、未入力なら `null`（未設定）のまま保存される。
- 編集: アイテム編集画面でロットを選択して単価を変更できる（ロット単位、`useUpdateLot`）。
- 表示: アイテム詳細ページの在庫情報に「在庫総額」を表示する（例: `¥450`）。
  単価が1件も設定されていないアイテムでは金額行自体を非表示にする。
  開封済みロットは残量比率で按分し、満額として表示しない。
  計算ロジックは `src/lib/inventoryValue.ts` の `computeInventoryValue`（純関数）。
- 集計: 統計ページ（`/_auth/stats`）に「カテゴリ別在庫金額」グラフを追加。単価未設定のロットは
  集計から除外される（`computeCategoryValueStats`、`src/types/stats.ts`）。
- 後方互換: 既存ロットは全て `unit_price = NULL`。`NULL` は「未設定」として扱い、金額計算・グラフ集計から
  除外する（0円として扱わない）。

## データ

`items` テーブル + `item_lots` + `consumption_logs` + `categories` + `storage_locations`。
スキーマは `docs/specs/database.md` 参照。

## API（hook）

| hook                 | 機能                                        |
| -------------------- | ------------------------------------------- |
| `useItems(filters?)` | 一覧（filter/sort 適用）                    |
| `useItem(id)`        | 詳細                                        |
| `useCreateItem`      | 追加                                        |
| `useUpdateItem(id)`  | 編集                                        |
| `useDeleteItem`      | 削除                                        |
| `useConsumeItem(id)` | 消費（楽観更新）                            |
| `useVerifyItem`      | 棚卸し確認（`last_verified_at` 更新）(#375) |

実装は `src/hooks/useItems.ts` を中心に、消費は `src/hooks/useConsumeItem.ts`、純粋ロジックは `src/lib/consume.ts`。

## バリデーション

- `name`: 必須・1〜120 文字
- `units`: 0 以上の整数
- `content_amount`: 0 より大きい数値、小数 2 桁まで
- `content_unit`: `user_settings` の許可単位リストに含まれること
- `opened_remaining`: `null` または `0 <= x <= content_amount`
- `expiry_date`: 過去日でも許容（既存履歴入力のため）
- `reorder_threshold`: `null` または 0 以上の整数（`auto_reorder = true` のときのみ入力可能）

## エラー

- 在庫不足での消費: フォーム側でブロック + 「最大量まで一括消費」ボタンで救済
- 削除確認のキャンセル: 何もしない
- ネットワーク失敗: トースト + リトライ

画像ライトボックスは `role="dialog"` / `aria-modal="true"` を持ち、表示時に閉じるボタンへ
フォーカスを移動する。Tabフォーカスをダイアログ内に閉じ込め、背景を `inert` にし、閉じた後は
起点要素へフォーカスを戻す。Escape・閉じるボタン・背景クリックで閉じられる。

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
