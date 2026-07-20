# Expiry Calendar — 機能仕様

## 概要

在庫アイテムの消費期限/賞味期限をカレンダー形式で可視化する画面。
期限切れ・今週・今月の期限情報を画面上部に要約し、チェックすると
最も期限が近いロットを消費済み（`consumption_logs` 記録付き）にできる。
同一 JANコードで再入荷したときはソフトデリート品が自動復活する（ソフトデリート自体は
本画面のチェック操作ではなく、一括操作の削除など他の導線から行われる。詳細は
「ソフトデリート仕様」節および「チェック操作の実装（ロット消費＋Undo）」節を参照）。

---

## ルーティング

```
_auth.calendar.tsx  →  /calendar
```

フッターナビゲーション 5 番目（Stats の右）に追加。

---

## 画面レイアウト

```
┌──────────────────────────────────────────┐
│  [期限切れ（赤）]       [今月その他]       │
│  item A ☐              item D ☐          │
│  item B ☐              item E ☐          │
│                                          │
│  [今週期限（黄）]                         │
│  item C ☐                                │
├──────────────────────────────────────────┤
│                                          │
│          月次カレンダー                   │
│    カテゴリ色で期限日にドット表示          │
│                                          │
└──────────────────────────────────────────┘
```

### 上部サマリー（2カラム）

| 位置 | 内容                                      | 文字色                   |
| ---- | ----------------------------------------- | ------------------------ |
| 左上 | 期限切れアイテム一覧                      | `text-destructive`（赤） |
| 左下 | 今週（今日〜7日後）に期限が切れるアイテム | `text-yellow-600`（黄）  |
| 右   | 今月期限切れ（上記2グループ以外）         | デフォルト               |

各アイテム行の構成:

```
☐  [カテゴリ色ドット]  商品名  (期限日)
```

チェックボックスを押すと:

1. 該当行に `line-through text-muted-foreground` を適用（即時）
2. `useCalendarConsume.check(item)` を呼び出す（詳細は下記「チェック操作の実装」節）
3. 確認なしで実行（誤操作は画面上の「元に戻す」で直後ならリカバー可能）

> **注記（実装との差分の解消, #448）**: 当初案ではチェック時に `useSoftDeleteItem` を呼び
> `items.deleted_at` を設定するソフトデリート方式を想定していたが、実装では
> 「最も期限が近いロットを1件消費済みにし、`consumption_logs` に記録した上で
> アプリ内 state による Undo を提供する」方式（ロット消費＋Undo）を採用している。
> 複数ロットを持つアイテムの一部ロットだけを期限切れとして処理できる・消費履歴/統計に
> 反映される、という利点がありソフトデリート方式より要件に適するため、本 spec を実装に
> 合わせて更新した（ソフトデリート自体は他機能で引き続き使用するため「ソフトデリート仕様」
> 節は変更していない）。

### チェック操作の実装（ロット消費＋Undo）

`useCalendarConsume`（`src/hooks/useCalendarConsume.ts`）が担う:

1. 対象アイテムのロットを `expiry_date` 昇順（null は最後）→ `created_at` 昇順で取得
2. 「在庫が残っており、かつ今月末までに期限を迎える」最初のロットを選ぶ
3. 該当ロットを `units: 0, opened_remaining: null` に更新し、`consumption_logs` へ
   消費イベントを記録する（消費量はロットの残量全量）
4. アイテムの集計値（units/expiry_date/opened_remaining）を `syncItemAggregate` で再計算
5. 取り消し用の情報（`lotId` / 消費前の `units`・`opened_remaining` / 作成した
   `consumption_logs.id`）をロットID単位でメモリ上の state (`pendingRemovals`) に保持する

「元に戻す」（Undo）を押すと:

1. 対象ロットを消費前の `units` / `opened_remaining` に戻す
2. 作成した `consumption_logs` 行を削除する
3. アイテムの集計値を再計算する

**制約**:

- Undo 情報はメモリ上の state のみで永続化しない。ページ遷移やリロードで
  Undo の導線は失われるが、サーバー側の消費（ロット更新・ログ）自体は既に確定している
  （＝在庫としては正しく消費済み状態のまま）。誤ってチェックした場合は、Undo が消える前に
  その場で取り消すか、アイテム編集画面から手動でロットを補正する
- 同一アイテムを複数回チェックすると、ロットごとに独立した Undo エントリが保持される
  （`pendingRemovals` は `lotId` をキーにしているため、後続のチェックが先のチェックの
  Undo 情報を上書きすることはない）
- ロット更新は取得時の `units` / `opened_remaining` を条件に含める。他端末が先に更新して
  条件に一致しなくなった場合は競合エラーとし、重複した消費ログを作成しない

### 下部カレンダー（月ビュー）

- カスタム実装（外部ライブラリ不使用、Tailwind CSS のみ）
- ヘッダー: `◀ YYYY年MM月 ▶`
- 日付セルに期限が当日のアイテム数ドット（カテゴリ色）を最大 3 個表示
- セルタップ → 該当日のアイテム一覧をボトムシートで表示（MVP は省略可）

---

## ソフトデリート仕様

### DB 変更

```sql
ALTER TABLE items
  ADD COLUMN deleted_at timestamptz DEFAULT NULL;

CREATE INDEX items_deleted_at_idx ON items (user_id, deleted_at)
  WHERE deleted_at IS NULL;
```

### 影響範囲

| 変更箇所      | 内容                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| `useItems`    | `.is('deleted_at', null)` フィルタを追加                                       |
| `useItem(id)` | ソフトデリート品は 404 扱い（詳細画面への直アクセス保護）                      |
| `itemSchema`  | `deleted_at: z.string().nullable().optional()` を追加                          |
| RLS           | 既存の `user_id = auth.uid()` に変更なし（削除済みも参照できるがUIでは非表示） |

### 復活ロジック

トリガー: `useCreateItem` 実行前にバーコードで既存ソフトデリート品を照会

```
1. 入力 barcode が存在する場合
2. items テーブルで barcode = ? AND deleted_at IS NOT NULL を検索
3. ヒットした場合 → 新規作成ではなく既存行を UPDATE
   - deleted_at = NULL
   - units = 新しい units
   - expiry_date = 新しい expiry_date
   - purchase_date = 新しい purchase_date
   - (name / category_id / content_amount / content_unit は保持)
4. ヒットしない場合 → 通常の INSERT
```

バーコードなしで登録した場合は復活ロジックをスキップ（手動管理）。

---

## カテゴリ色分け

- `categories.color` カラム（既存、`text` 型、`#RRGGBB` 形式）を使用
- 未設定カテゴリは `bg-gray-400` フォールバック
- カテゴリ管理画面に Tailwind 既定 10 色のカラーパレットピッカーを追加

### 使用カラーパレット（Tailwind 500 系）

```
#ef4444  red-500
#f97316  orange-500
#eab308  yellow-500
#22c55e  green-500
#06b6d4  cyan-500
#3b82f6  blue-500
#8b5cf6  violet-500
#ec4899  pink-500
#6b7280  gray-500
#14b8a6  teal-500
```

---

## Atomic Design 配置

| コンポーネント    | 分類     | パス                                           |
| ----------------- | -------- | ---------------------------------------------- |
| `ColorDot`        | atom     | `src/components/atoms/ColorDot.tsx`            |
| `ExpiryCheckItem` | molecule | `src/components/molecules/ExpiryCheckItem.tsx` |
| `ExpiryCalendar`  | organism | `src/components/organisms/ExpiryCalendar.tsx`  |
| `ExpirySummary`   | organism | `src/components/organisms/ExpirySummary.tsx`   |

---

## i18n キー（追加）

```json
// calendar namespace
{
  "title": "期限カレンダー",
  "expired": "期限切れ",
  "thisWeek": "今週期限",
  "thisMonth": "今月その他",
  "noExpired": "期限切れなし",
  "noThisWeek": "今週は期限切れなし",
  "noThisMonth": "今月の期限切れなし",
  "softDeleteSuccess": "在庫から除きました",
  "reviveSuccess": "再入荷を検出、在庫を復活しました"
}
```

---

## 未対応（MVP スコープ外）

- カレンダーの日付セルタップによるボトムシート
- 週/日ビューの切替
- ソフトデリート一覧（ゴミ箱）画面
- 手動での復活操作 UI（バーコード再スキャンによる自動復活のみ）
