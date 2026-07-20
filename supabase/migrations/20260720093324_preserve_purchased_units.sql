-- item_lots.units is remaining stock and decreases as the lot is consumed.
-- Preserve the quantity at insertion time so purchase-history exports remain
-- historically accurate. The trigger also prevents later client updates from
-- rewriting the snapshot.

alter table public.item_lots
  add column purchased_units integer check (purchased_units >= 0);

update public.item_lots
set purchased_units = units;

alter table public.item_lots
  alter column purchased_units set not null;

create or replace function public.preserve_item_lot_purchased_units()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.purchased_units := new.units;
  else
    new.purchased_units := old.purchased_units;
  end if;
  return new;
end;
$$;

create trigger item_lots_preserve_purchased_units
  before insert or update of purchased_units on public.item_lots
  for each row execute function public.preserve_item_lot_purchased_units();
