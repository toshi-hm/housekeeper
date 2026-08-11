-- #752: 開封後の消費期限リマインダー。
--
-- item_lots.opened_at: そのロットが最初に開封された（opened_remaining が
-- 初めて非nullになった）日時。未開封 / 一度も開封されていない場合は null。
-- items.opened_at: item_lots からの集計値（syncItemAggregate、
-- src/hooks/useItemLots.ts）。ロットが存在せず items 側を直接更新する
-- レガシー経路（useConsumeItem.ts の "direct" フォールバック）向けに
-- アプリ側で同様の遷移ロジックを個別に適用する。
-- days_use_after_opening: 開封後の推奨使用日数。items（個別上書き）と
-- categories（既定値）の両方に持たせ、items 側が優先、未設定なら
-- categories 側にフォールバックする（アプリ側で解決、DB制約はしない）。
alter table public.item_lots
  add column if not exists opened_at timestamptz;

alter table public.items
  add column if not exists opened_at timestamptz,
  add column if not exists days_use_after_opening integer
    check (days_use_after_opening is null or days_use_after_opening > 0);

alter table public.categories
  add column if not exists days_use_after_opening integer
    check (days_use_after_opening is null or days_use_after_opening > 0);

-- item_lots への直接書き込み（consumeLot / updateLot / カレンダーからの
-- ゼロ化 等、すべて item_lots テーブルへの INSERT/UPDATE を経由する）を
-- 1箇所で捕捉し、opened_remaining の null <-> 非null 遷移を自動的に
-- opened_at へ反映する。restoreLotConsumption（undo）のように呼び出し側が
-- 復元すべき正確な opened_at を知っている場合は、そのUPDATE文で
-- opened_at を明示的に指定すればこの自動遷移は発動せず、明示値がそのまま
-- 採用される（詳しくは関数本体のコメント参照）。
--
-- items テーブル側には同種のトリガーを **意図的に付けない**:
-- items.opened_remaining/opened_at は syncItemAggregate が複数ロットから
-- 都度再計算して明示的に書き込む集約値であり、「直前の書き込みからの単純な
-- 遷移」ではなく「現在アクティブな全ロットの中で最も古い opened_at」を
-- 再計算する必要があるため、同じトリガーを items にも付けると
-- syncItemAggregate が計算した正しい値をトリガーが now() で
-- 上書きしてしまう（両テーブルで opened_at の意味・更新契機が異なるため）。
-- Only auto-manages opened_at when the caller leaves it untouched in the
-- INSERT/UPDATE statement (new.opened_at is still whatever it defaulted to /
-- equals old.opened_at) — if the caller explicitly set opened_at in the same
-- statement (e.g. restoreLotConsumption restoring a lot's pre-consumption
-- opened_at on undo), that explicit value is trusted and left alone. Without
-- this guard, restoring a previously-open lot back to a non-null
-- opened_remaining would always get its opened_at overwritten to now() by
-- the automatic transition logic below, discarding the real historical
-- value the undo is trying to restore (#752 code review).
create or replace function public.set_item_lot_opened_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.opened_at is null and new.opened_remaining is not null then
      new.opened_at = now();
    end if;
    return new;
  end if;

  if new.opened_at is not distinct from old.opened_at then
    if new.opened_remaining is not null and old.opened_remaining is null then
      new.opened_at = now();
    elsif new.opened_remaining is null and old.opened_remaining is not null then
      new.opened_at = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists item_lots_set_opened_at on public.item_lots;
create trigger item_lots_set_opened_at
  before insert or update on public.item_lots
  for each row
  execute function public.set_item_lot_opened_at();

-- bulk_consume_items（#743, 20260805000002）はロットを削除した上で items を
-- 直接 units=0 / opened_remaining=null にリセットするが、items には上記の
-- トリガーを付けていないため opened_at のクリアも明示的に行う必要がある。
-- 元の関数定義に opened_at=null を1行追加しただけで、他のロジックは不変。
create or replace function public.bulk_consume_items(p_item_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    return;
  end if;

  with computed as (
    select
      lot.item_id,
      lot.units,
      lot.opened_remaining,
      item.content_unit,
      round(
        (case
          when lot.opened_remaining is not null
            then greatest(0, lot.units - 1) * item.content_amount + lot.opened_remaining
          else lot.units * item.content_amount
        end)::numeric,
        2
      ) as delta_amount
    from public.item_lots as lot
    join public.items as item on item.id = lot.item_id
    where lot.item_id = any (p_item_ids)
      and lot.user_id = v_user_id
      and item.user_id = v_user_id
  )
  insert into public.consumption_logs (
    user_id, item_id, delta_amount, delta_unit,
    units_before, units_after, opened_remaining_before, opened_remaining_after
  )
  select v_user_id, item_id, delta_amount, content_unit, units, 0, opened_remaining, null
  from computed
  where delta_amount > 0;

  delete from public.item_lots
    where item_id = any (p_item_ids)
      and user_id = v_user_id;

  update public.items as item
    set units = 0,
        opened_remaining = null,
        opened_at = null,
        expiry_date = null,
        updated_at = v_now
    where item.id = any (p_item_ids)
      and item.user_id = v_user_id;
end;
$$;

revoke all on function public.bulk_consume_items(uuid[]) from public;
grant execute on function public.bulk_consume_items(uuid[]) to authenticated;
