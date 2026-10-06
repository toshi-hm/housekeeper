-- #1179: 世帯共有化(20261002010749)後も作成者(user_id = auth.uid())で絞っていた
-- RPC を世帯単位へ移行する。関数は security invoker のままなので RLS が世帯外の
-- 行を遮断し、明示的な述語は意図の明文化とポリシードリフトへの保険を兼ねる。
--   1. delete_category_if_unused / delete_storage_location_if_unused:
--      他メンバー作成の行を削除すると 0 行 no-op で無言成功していた。
--   2. import_items_batch: バーコード重複判定が作成者単位で、他メンバー所有品と
--      重複作成され得た。
--   3. auto_archive_expired_items / undo_auto_archive: 呼び出し者作成分のみが対象。
--      設定(auto_archive_after_days 等)は従来どおり呼び出し者本人のもの。

create or replace function public.delete_category_if_unused(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from categories
  where id = p_id
    and household_id = private.current_household_id()
    and not exists (
      select 1 from items
      where items.category_id = p_id
        and items.deleted_at is null
    );

  if not found then
    if exists (
      select 1 from items
      where items.category_id = p_id
        and items.deleted_at is null
    ) then
      raise exception 'category is in use' using errcode = 'HK001';
    end if;
  end if;
end;
$$;

create or replace function public.delete_storage_location_if_unused(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from storage_locations
  where id = p_id
    and household_id = private.current_household_id()
    and not exists (
      select 1 from items
      where items.storage_location_id = p_id
        and items.deleted_at is null
    );

  if not found then
    if exists (
      select 1 from items
      where items.storage_location_id = p_id
        and items.deleted_at is null
    ) then
      raise exception 'storage location is in use' using errcode = 'HK002';
    end if;
  end if;
end;
$$;

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
  v_household_id uuid := private.current_household_id();
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
      where household_id = v_household_id and barcode = v_barcode and deleted_at is null
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
      where item_lots.item_id = v_existing_id;

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

      -- item_type/days_use_after_opening/reorder_lead_days/pin_x/pin_y は今回
      -- 追加した項目のため、これらのキーを持たない古い形式のバックアップ
      -- （このマイグレーション以前にエクスポートされた JSON）を overwrite で
      -- 取り込むと、キーが存在せず NULL 評価されて既存の設定値が消えてしまう。
      -- `?` 演算子でキーの有無を見て、キーが無ければ既存値を維持する（キーが
      -- あって値が null の場合は itemsToJSON の仕様通り「上書きで解除」を
      -- 尊重し、coalesce ではなく既存値を明示的に null にする）。
      update items
      set
        name = v_item ->> 'name',
        content_amount = (v_item ->> 'content_amount')::numeric,
        content_unit = v_item ->> 'content_unit',
        expiry_type = v_item ->> 'expiry_type',
        item_type = case when v_item ? 'item_type' then v_item ->> 'item_type' else items.item_type end,
        notes = v_item ->> 'notes',
        minimum_stock = (v_item ->> 'minimum_stock')::int,
        auto_reorder = coalesce((v_item ->> 'auto_reorder')::boolean, false),
        reorder_threshold = (v_item ->> 'reorder_threshold')::int,
        days_use_after_opening = case
          when v_item ? 'days_use_after_opening' then (v_item ->> 'days_use_after_opening')::int
          else items.days_use_after_opening
        end,
        reorder_lead_days = case
          when v_item ? 'reorder_lead_days' then (v_item ->> 'reorder_lead_days')::int
          else items.reorder_lead_days
        end,
        pin_x = case when v_item ? 'pin_x' then (v_item ->> 'pin_x')::numeric else items.pin_x end,
        pin_y = case when v_item ? 'pin_y' then (v_item ->> 'pin_y')::numeric else items.pin_y end
      where id = v_existing_id and household_id = v_household_id;

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

create or replace function public.auto_archive_expired_items()
returns table(id uuid, archived_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid := private.current_household_id();
  v_after_days integer;
  v_timezone text;
  v_today date;
  v_archived_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select settings.auto_archive_after_days
    into v_after_days
    from public.user_settings as settings
    where settings.user_id = v_user_id;

  if v_after_days is null then
    return;
  end if;

  select prefs.timezone
    into v_timezone
    from public.notification_preferences as prefs
    where prefs.user_id = v_user_id;

  begin
    v_today := (v_archived_at at time zone coalesce(v_timezone, 'Asia/Tokyo'))::date;
  exception when others then
    v_today := (v_archived_at at time zone 'Asia/Tokyo')::date;
  end;

  return query
    update public.items as item
      set deleted_at = v_archived_at,
          updated_at = v_archived_at
      where item.household_id = v_household_id
        and item.deleted_at is null
        and item.units > 0
        and item.expiry_date is not null
        and item.expiry_date <= v_today - v_after_days
        and coalesce(
              item.item_type,
              (select category.kind from public.categories as category
                where category.id = item.category_id),
              'food'
            ) <> 'daily_goods'
      returning item.id, v_archived_at;
end;
$$;

create or replace function public.undo_auto_archive(
  p_item_ids uuid[],
  p_archived_at timestamptz
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with restored as (
    update public.items as item
      set deleted_at = null,
          updated_at = clock_timestamp()
      where item.household_id = private.current_household_id()
        and item.id = any (p_item_ids)
        and item.deleted_at = p_archived_at
      returning 1
  )
  select count(*)::integer from restored;
$$;

revoke all on function public.auto_archive_expired_items() from public;
revoke all on function public.undo_auto_archive(uuid[], timestamptz) from public;
grant execute on function public.auto_archive_expired_items() to authenticated;
grant execute on function public.undo_auto_archive(uuid[], timestamptz) to authenticated;
