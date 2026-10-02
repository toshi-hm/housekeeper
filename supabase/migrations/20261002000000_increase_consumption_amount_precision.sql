-- Small volume/weight conversions need more than two decimal places in the
-- item's canonical unit (for example, 15 mL = 0.015 L).
alter table items
  alter column opened_remaining type numeric(16,6);

alter table item_lots
  alter column opened_remaining type numeric(16,6);

alter table consumption_logs
  alter column delta_amount type numeric(16,6),
  alter column opened_remaining_before type numeric(16,6),
  alter column opened_remaining_after type numeric(16,6);
