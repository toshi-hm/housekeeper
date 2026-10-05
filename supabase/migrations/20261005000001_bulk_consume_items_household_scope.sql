-- #1178: bulk_consume_items (#743, 20260811000002) filtered lots/items by the
-- creator (`user_id = auth.uid()`), but inventory is now shared per household.
-- When a member bulk-consumed an item created by another member, the log insert
-- and items reset were skipped while the member's own lots were still deleted
-- (or the whole call silently did nothing), leaving items.units out of sync.
--
-- Scope by the caller's household instead. The function stays security
-- invoker, so RLS still limits rows to the household; the explicit predicate
-- documents the intent and guards against policy drift. consumption_logs.user_id
-- records the acting member (the household trigger also enforces it).

create or replace function public.bulk_consume_items(p_item_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid := private.current_household_id();
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
      and item.household_id = v_household_id
  )
  insert into public.consumption_logs (
    user_id, item_id, delta_amount, delta_unit,
    units_before, units_after, opened_remaining_before, opened_remaining_after
  )
  select v_user_id, item_id, delta_amount, content_unit, units, 0, opened_remaining, null
  from computed
  where delta_amount > 0;

  delete from public.item_lots as lot
    using public.items as item
    where lot.item_id = item.id
      and lot.item_id = any (p_item_ids)
      and item.household_id = v_household_id;

  update public.items as item
    set units = 0,
        opened_remaining = null,
        opened_at = null,
        expiry_date = null,
        updated_at = v_now
    where item.id = any (p_item_ids)
      and item.household_id = v_household_id;
end;
$$;

revoke all on function public.bulk_consume_items(uuid[]) from public;
grant execute on function public.bulk_consume_items(uuid[]) to authenticated;
