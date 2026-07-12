-- Backfill: items.expiry_date / opened_remaining could keep reflecting a
-- fully depleted lot (zero remaining stock) because the app's aggregate
-- sync did not exclude such lots. This caused already-out-of-stock items
-- to keep showing up in the expiry calendar. Recompute existing rows using
-- the same "active lot" rule the app now enforces (remaining amount > 0).
with lot_amounts as (
  select
    l.id,
    l.item_id,
    l.units,
    l.opened_remaining,
    l.expiry_date,
    case
      when l.opened_remaining is not null
        then greatest(0, l.units - 1) * i.content_amount + l.opened_remaining
      else l.units * i.content_amount
    end as remaining_amount
  from item_lots l
  join items i on i.id = l.item_id
),
active_lots as (
  select * from lot_amounts where remaining_amount > 0
),
open_lot_counts as (
  select item_id, count(*) as open_count
  from active_lots
  where opened_remaining is not null
  group by item_id
),
single_open_lot as (
  select a.item_id, a.opened_remaining
  from active_lots a
  join open_lot_counts c on c.item_id = a.item_id and c.open_count = 1
  where a.opened_remaining is not null
),
aggregates as (
  select
    i.id as item_id,
    coalesce(sum(l.units), 0) as total_units,
    min(al.expiry_date) as earliest_expiry
  from items i
  left join item_lots l on l.item_id = i.id
  left join active_lots al on al.item_id = i.id
  group by i.id
)
update items
set
  units = aggregates.total_units,
  expiry_date = aggregates.earliest_expiry,
  opened_remaining = single_open_lot.opened_remaining,
  updated_at = now()
from aggregates
left join single_open_lot on single_open_lot.item_id = aggregates.item_id
where items.id = aggregates.item_id
  and items.deleted_at is null
  and (
    items.units is distinct from aggregates.total_units
    or items.expiry_date is distinct from aggregates.earliest_expiry
    or items.opened_remaining is distinct from single_open_lot.opened_remaining
  );
