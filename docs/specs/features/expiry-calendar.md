# Expiry Calendar — 機能仕様

## 概要

在庫アイテムの消費期限/賞味期限をカレンダー形式で可視化する画面。
期限切れ・今週・今月の期限情報を画面上部に要約し、チェックすると
在庫から論理削除（ソフトデリート）できる。
同一 JANコードで再入荷したときはソフトデリート品が自動復活する。

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

| 位置 | 内容 | 文字色 |
|------|------|--------|
| 左上 | 期限切れアイテム一覧 | `text-destructive`（赤） |
| 左下 | 今週（今日〜7日後）に期限が切れるアイテム | `text-yellow-600`（黄） |
| 右   | 今月期限切れ（上記2グループ以外）| デフォルト |

各アイテム行の構成:

```
☐  [カテゴリ色ドット]  商品名  (期限日)
```

チェックボックスを押すと:
1. 該当行に `line-through text-muted-foreground` を適用（即時）
2. `useSoftDeleteItem` を呼び出し `items.deleted_at = now()` を設定
3. 確認なしで実行（誤操作は復活機能でリカバー）

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

| 変更箇所 | 内容 |
|----------|------|
| `useItems` | `.is('deleted_at', null)` フィルタを追加 |
| `useItem(id)` | ソフトデリート品は 404 扱い（詳細画面への直アクセス保護） |
| `itemSchema` | `deleted_at: z.string().nullable().optional()` を追加 |
| RLS | 既存の `user_id = auth.uid()` に変更なし（削除済みも参照できるがUIでは非表示） |

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

| コンポーネント | 分類 | パス |
|----------------|------|------|
| `ColorDot` | atom | `src/components/atoms/ColorDot.tsx` |
| `ExpiryCheckItem` | molecule | `src/components/molecules/ExpiryCheckItem.tsx` |
| `ExpiryCalendar` | organism | `src/components/organisms/ExpiryCalendar.tsx` |
| `ExpirySummary` | organism | `src/components/organisms/ExpirySummary.tsx` |

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
