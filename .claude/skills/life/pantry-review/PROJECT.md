# PROJECT.md — pantry-review（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除する（→ ユーザーに在庫を聞く汎用モードで動く）。

## 在庫データソース

Supabase MCP の `execute_sql` で **SELECT のみ** 実行する。
プロジェクトは `list_projects` で特定。MCP が使えない場合は SKILL.md の汎用モードへフォールバック。

```sql
-- 1. 在庫全体（期限順）
select i.name, i.units, i.content_amount, i.content_unit, i.opened_remaining,
       i.expiry_date, i.purchase_date, c.name as category, s.name as location
from items i
left join categories c on c.id = i.category_id
left join storage_locations s on s.id = i.storage_location_id
where i.deleted_at is null
order by i.expiry_date asc nulls last;

-- 2. 直近30日の消費ログ（動きの有無）
select item_id, sum(delta) as consumed, max(occurred_at) as last_used
from consumption_logs
where occurred_at > now() - interval '30 days'
group by item_id;

-- 3. 買い物リストの積み残し
select name, status, created_at
from shopping_list_items
where status = 'planned'
order by created_at asc;
```

（`shopping_list_items` は v1.1 以降。テーブルがなければスキップする）

## 分析条件のマッピング

- デッドストック: `units > 0` かつ直近 30 日の消費ログなし、かつ `purchase_date` が 30 日以上前
- 欠品候補: `units = 0`（使い切り状態）のうち `consumption_logs` の実績が多いもの
- 記録衛生: `expiry_date is null` の食品 / `category_id is null` /
  `storage_location_id is null` / `opened_remaining = 0` のまま放置

## 買い物リスト連携（承認制）

登録を望まれたら `shopping_list_items` への INSERT を提示 → 承認 → 実行する。
`user_id` は既存行から取得、`status = 'planned'`。
