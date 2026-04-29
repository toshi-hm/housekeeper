# Feature Spec: Consumption & Purchase History

## 概要

在庫の **消費イベント** を記録して履歴閲覧と統計（`stats.md`）の元データとする。
購入履歴は MVP では **`items.purchase_date` + 単独行** で表現し、専用テーブルは持たない（Q7=b）。
将来同じ SKU の再購入を集約する必要が出れば `purchase_logs` を追加する余地を残す。

## ユーザーストーリー

- 「使う」操作のたびに履歴が残る
- item 詳細に「履歴」タブがあり、消費の時系列が見える
- 全体の月次消費量（カテゴリ別）が統計画面で見える

## データ

`consumption_logs`（`docs/specs/database.md` 参照）。
購入履歴は `items` を `purchase_date desc` で並べることで代替する。

## API（hook）

| hook                          | 機能                                   |
| ----------------------------- | -------------------------------------- |
| `useConsumeItem(id)`          | 消費アクション（item 更新 + log 追加） |
| `useConsumptionLogs(itemId?)` | 履歴一覧                               |

`useConsumeItem` は楽観更新:

1. キャッシュ上で item の `units` / `opened_remaining` を即時更新
2. 並列で `consumption_logs` を invalidate
3. 失敗時はキャッシュをロールバックし、トーストで通知

実装は **トランザクションを Postgres 関数 (RPC)** で書くのが安全:

```sql
create or replace function public.consume_item(
  _item_id uuid,
  _delta numeric,
  _delta_unit text
) returns items
language plpgsql security invoker as $$
declare
  it items%rowtype;
begin
  select * into it from items where id = _item_id for update;
  if not found then raise exception 'not_found'; end if;

  -- ロジックは spec/features/inventory.md の擬似コードに従う
  -- ... 計算 ...

  update items set
    units = it.units,
    opened_remaining = it.opened_remaining,
    updated_at = now()
  where id = _item_id
  returning * into it;

  insert into consumption_logs (
    user_id, item_id, delta_amount, delta_unit,
    units_before, units_after,
    opened_remaining_before, opened_remaining_after
  ) values (
    auth.uid(), _item_id, _delta, _delta_unit,
    /* before */, it.units,
    /* before */, it.opened_remaining
  );

  return it;
end $$;
```

クライアントは `supabase.rpc('consume_item', { _item_id, _delta, _delta_unit })`。

## エラー

- 在庫不足: 関数内で `raise exception 'insufficient_stock'`
- アイテム未存在: `raise exception 'not_found'`
- いずれもトーストで i18n メッセージ

## v1 範囲

- `consumption_logs` の追加
- `consume_item` RPC + `useConsumeItem`
- ロジックの単体テスト（`bun test`）

## v1.1 範囲

- item 詳細に「履歴」タブ
- 全体の最近の消費イベント一覧（任意）

## Backlog

- 単位換算（mL ⇔ L）
- 消費の取り消し（log の rollback）
- 購入履歴専用テーブル（同 SKU 再購入の集約）
