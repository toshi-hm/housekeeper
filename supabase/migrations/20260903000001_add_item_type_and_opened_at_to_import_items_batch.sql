-- #973 / #974: `import_items_batch` (last replaced by
-- 20260804000001_add_expiry_type_to_import_items_batch.sql) still hard-codes
-- the item/lot columns it reads from each entry's JSON, so several fields
-- added to `items`/`item_lots` since then were silently dropped on import
-- even though the JSON export/import schema now carries them
-- (src/lib/export.ts, this same change):
--
-- items: item_type (#937), days_use_after_opening (#752), reorder_lead_days
-- (#853), pin_x / pin_y (#574).
-- item_lots: opened_at (#752) — without this, a restored already-opened lot
-- gets `opened_at` silently reset to the import timestamp by the
-- `item_lots_set_opened_at` trigger (20260811000002_opened_at_reminder.sql),
-- since that trigger only auto-sets opened_at when the caller leaves it
-- untouched in the INSERT. Explicitly inserting the exported opened_at (or
-- null) avoids that.
--
-- Replace the function to also read/write these columns, keeping every
-- other behavior identical (same signature, same duplicate-strategy
-- branches).
--
-- p_items shape: unchanged except each item object may now also carry
-- "item_type": "food"|"daily_goods"|null, "days_use_after_opening": int|null,
-- "reorder_lead_days": int|null, "pin_x"/"pin_y": numeric|null, and each lot
-- object may also carry "opened_at": timestamptz|null.
create or replace function public.import_items_batch(p_items jsonb, p_duplicate_strategy text)
returns table (item_id uuid, action text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_lot jsonb;
  v_barcode text;
  v_existing_id uuid;
  v_new_item_id uuid;
  v_store_name text;
begin
  if p_duplicate_strategy not in ('skip', 'overwrite', 'duplicate') then
    raise exception 'invalid duplicate strategy: %', p_duplicate_strategy using errcode = 'HK004';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_barcode := v_item ->> 'barcode';
    v_existing_id := null;

    if v_barcode is not null then
      -- Re-queried on every iteration within the same transaction, so an
      -- item created earlier in this same batch is already visible here
      -- (read-your-own-writes) and correctly caught as a duplicate.
      select id into v_existing_id
      from items
      where user_id = auth.uid() and barcode = v_barcode and deleted_at is null
      limit 1;
    end if;

    if v_existing_id is not null and p_duplicate_strategy = 'skip' then
      item_id := v_existing_id;
      action := 'skipped';
      return next;
      continue;
    end if;

    if v_existing_id is not null and p_duplicate_strategy = 'overwrite' then
      -- 数量・期限・開封残量はロット単位で管理されているため、items 行を
      -- 直接上書きするのではなく既存ロットを入れ替えてから反映する。
      delete from item_lots
      where item_lots.item_id = v_existing_id and item_lots.user_id = auth.uid();

      for v_lot in select * from jsonb_array_elements(v_item -> 'lots')
      loop
        v_store_name := nullif(trim(v_lot ->> 'store_name'), '');
        insert into item_lots (
          user_id, item_id, units, opened_remaining, unit_price, purchase_date,
          expiry_date, store_name, opened_at
        )
        values (
          auth.uid(),
          v_existing_id,
          (v_lot ->> 'units')::int,
          (v_lot ->> 'opened_remaining')::numeric,
          (v_lot ->> 'unit_price')::int,
          (v_lot ->> 'purchase_date')::date,
          (v_lot ->> 'expiry_date')::date,
          v_store_name,
          (v_lot ->> 'opened_at')::timestamptz
        );
      end loop;

      update items
      set
        name = v_item ->> 'name',
        content_amount = (v_item ->> 'content_amount')::numeric,
        content_unit = v_item ->> 'content_unit',
        expiry_type = v_item ->> 'expiry_type',
        item_type = v_item ->> 'item_type',
        notes = v_item ->> 'notes',
        minimum_stock = (v_item ->> 'minimum_stock')::int,
        auto_reorder = coalesce((v_item ->> 'auto_reorder')::boolean, false),
        reorder_threshold = (v_item ->> 'reorder_threshold')::int,
        days_use_after_opening = (v_item ->> 'days_use_after_opening')::int,
        reorder_lead_days = (v_item ->> 'reorder_lead_days')::int,
        pin_x = (v_item ->> 'pin_x')::numeric,
        pin_y = (v_item ->> 'pin_y')::numeric
      where id = v_existing_id and user_id = auth.uid();

      item_id := v_existing_id;
      action := 'updated';
      return next;
      continue;
    end if;

    -- "duplicate"（既存があっても新規として追加）または重複なし: 新規作成する。
    insert into items (
      user_id, name, barcode, content_amount, content_unit, expiry_type, item_type,
      notes, minimum_stock, auto_reorder, reorder_threshold, days_use_after_opening,
      reorder_lead_days, pin_x, pin_y
    )
    values (
      auth.uid(),
      v_item ->> 'name',
      v_barcode,
      (v_item ->> 'content_amount')::numeric,
      v_item ->> 'content_unit',
      v_item ->> 'expiry_type',
      v_item ->> 'item_type',
      v_item ->> 'notes',
      (v_item ->> 'minimum_stock')::int,
      coalesce((v_item ->> 'auto_reorder')::boolean, false),
      (v_item ->> 'reorder_threshold')::int,
      (v_item ->> 'days_use_after_opening')::int,
      (v_item ->> 'reorder_lead_days')::int,
      (v_item ->> 'pin_x')::numeric,
      (v_item ->> 'pin_y')::numeric
    )
    returning id into v_new_item_id;

    for v_lot in select * from jsonb_array_elements(v_item -> 'lots')
    loop
      v_store_name := nullif(trim(v_lot ->> 'store_name'), '');
      insert into item_lots (
        user_id, item_id, units, opened_remaining, unit_price, purchase_date,
        expiry_date, store_name, opened_at
      )
      values (
        auth.uid(),
        v_new_item_id,
        (v_lot ->> 'units')::int,
        (v_lot ->> 'opened_remaining')::numeric,
        (v_lot ->> 'unit_price')::int,
        (v_lot ->> 'purchase_date')::date,
        (v_lot ->> 'expiry_date')::date,
        v_store_name,
        (v_lot ->> 'opened_at')::timestamptz
      );
    end loop;

    item_id := v_new_item_id;
    action := 'created';
    return next;
  end loop;
end;
$$;

grant execute on function public.import_items_batch(jsonb, text) to authenticated;
