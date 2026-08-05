-- #743: bulkConsumeItems previously ran as separate client-side requests
-- (consumption_logs insert -> item_lots delete -> items update). If the
-- delete succeeded but the items update failed (network drop, session
-- expiry), item_lots ended up empty (real stock 0) while items.units still
-- showed the pre-consumption value, and syncItemAggregate is never invoked
-- from this path to self-heal the mismatch.
--
-- Wrap the log insert + lot delete + item reset in a single function so it
-- runs as one atomic transaction: either all three happen together, or
-- nothing changes.

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
        expiry_date = null,
        updated_at = v_now
    where item.id = any (p_item_ids)
      and item.user_id = v_user_id;
end;
$$;

revoke all on function public.bulk_consume_items(uuid[]) from public;
grant execute on function public.bulk_consume_items(uuid[]) to authenticated;
