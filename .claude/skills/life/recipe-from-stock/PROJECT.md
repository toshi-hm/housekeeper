# PROJECT.md — recipe-from-stock（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除する（→ ユーザーに食材を聞く汎用モードで動く）。

## 在庫データソース

Supabase MCP の `execute_sql` で **SELECT のみ** 実行する。
プロジェクトは `list_projects` で特定。MCP が使えない場合は SKILL.md の汎用モードへフォールバック。

```sql
select
  i.name,
  i.units,
  i.content_amount,
  i.content_unit,
  i.opened_remaining,
  i.expiry_date,
  c.name as category,
  s.name as location
from items i
left join categories c on c.id = i.category_id
left join storage_locations s on s.id = i.storage_location_id
where i.deleted_at is null
  and i.units > 0
order by i.expiry_date asc nulls last;
```

## データの読み方

- `opened_remaining` が数値 = 開封中で残量あり → 🔴 至急寄りに扱う
- 総量 = `units × content_amount`（`content_unit` 単位）
- `category` で食材/非食材（日用品等）を判別して非食材を除外する

## 買い物リスト連携（承認制）

ユーザーが買い足しの登録を望んだ場合のみ、`shopping_list_items` への INSERT を
提示 → 承認 → 実行する。`user_id` は既存行から取得、`status = 'planned'`。
