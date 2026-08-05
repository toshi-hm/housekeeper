-- #746: `import_items_batch` (20260731000001_atomic_import_items.sql, last
-- replaced by 20260803000000_normalize_store_name_in_import_items_batch.sql)
-- hard-codes the `items` columns it reads from each item's JSON, so
-- `items.expiry_type` (added by 20260801000001_add_expiry_type_to_items.sql)
-- was silently dropped on import even though the JSON export/import schema
-- now carries it (src/lib/export.ts). Replace the function to also
-- read/write `expiry_type` on both the create and overwrite branches,
-- keeping every other behavior identical (same signature, same
-- duplicate-strategy branches).
--
-- Since `create or replace function` replaces the whole body, this also
-- carries forward the #747 store_name trim+null normalization from
-- 20260803000000_normalize_store_name_in_import_items_batch.sql — omitting
-- it here would silently re-introduce that bug for every import going
-- forward.
--
-- p_items shape: unchanged except each item object may now also carry
-- "expiry_type": "best_before"|"use_by"|null.
--
-- Also fixes a latent bug present since the function's original creation
-- (20260731000001_atomic_import_items.sql): the "overwrite" branch's
-- `delete from item_lots where item_id = v_existing_id and user_id =
-- auth.uid()` was ambiguous between the `item_lots`/`user_id` table columns
-- and the function's own `item_id` OUT parameter (from `returns table
-- (item_id uuid, action text)`), raising "column reference is ambiguous" at
-- runtime for every overwrite-strategy import with a matching barcode. No
-- pgTAP test exercised this branch, so it went undetected. Qualified with
-- the table name to resolve it.
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
          expiry_date, store_name
        )
        values (
          auth.uid(),
          v_existing_id,
          (v_lot ->> 'units')::int,
          (v_lot ->> 'opened_remaining')::numeric,
          (v_lot ->> 'unit_price')::int,
          (v_lot ->> 'purchase_date')::date,
          (v_lot ->> 'expiry_date')::date,
          v_store_name
        );
      end loop;

      update items
      set
        name = v_item ->> 'name',
        content_amount = (v_item ->> 'content_amount')::numeric,
        content_unit = v_item ->> 'content_unit',
        expiry_type = v_item ->> 'expiry_type',
        notes = v_item ->> 'notes',
        minimum_stock = (v_item ->> 'minimum_stock')::int,
        auto_reorder = coalesce((v_item ->> 'auto_reorder')::boolean, false),
        reorder_threshold = (v_item ->> 'reorder_threshold')::int
      where id = v_existing_id and user_id = auth.uid();

      item_id := v_existing_id;
      action := 'updated';
      return next;
      continue;
    end if;

    -- "duplicate"（既存があっても新規として追加）または重複なし: 新規作成する。
    insert into items (
      user_id, name, barcode, content_amount, content_unit, expiry_type, notes,
      minimum_stock, auto_reorder, reorder_threshold
    )
    values (
      auth.uid(),
      v_item ->> 'name',
      v_barcode,
      (v_item ->> 'content_amount')::numeric,
      v_item ->> 'content_unit',
      v_item ->> 'expiry_type',
      v_item ->> 'notes',
      (v_item ->> 'minimum_stock')::int,
      coalesce((v_item ->> 'auto_reorder')::boolean, false),
      (v_item ->> 'reorder_threshold')::int
    )
    returning id into v_new_item_id;

    for v_lot in select * from jsonb_array_elements(v_item -> 'lots')
    loop
      v_store_name := nullif(trim(v_lot ->> 'store_name'), '');
      insert into item_lots (
        user_id, item_id, units, opened_remaining, unit_price, purchase_date,
        expiry_date, store_name
      )
      values (
        auth.uid(),
        v_new_item_id,
        (v_lot ->> 'units')::int,
        (v_lot ->> 'opened_remaining')::numeric,
        (v_lot ->> 'unit_price')::int,
        (v_lot ->> 'purchase_date')::date,
        (v_lot ->> 'expiry_date')::date,
        v_store_name
      );
    end loop;

    item_id := v_new_item_id;
    action := 'created';
    return next;
  end loop;
end;
$$;

grant execute on function public.import_items_batch(jsonb, text) to authenticated;
