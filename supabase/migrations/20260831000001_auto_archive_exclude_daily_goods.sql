-- #951: auto_archive_expired_items が item_type/カテゴリkindを無視しており、
-- カテゴリを後から日用品（daily_goods）へ切り替えた既存アイテムに残った
-- 食料品時代のexpiry_dateを見て、ユーザーの操作なしにソフトデリートしてしまう。
--
-- ダッシュボード（dropExpiryForDailyGoods）・期限カレンダー・期限通知（#937）は
-- 実効種別（アイテム個別のitem_type → カテゴリのkind → 既定'food'）が daily_goods の
-- アイテムを期限扱いから除外済みだが、本RPCはそのフォローアップ対象に含まれて
-- いなかった。同じ解決順位（resolveItemType と同一）のフィルタを追加する。
create or replace function public.auto_archive_expired_items()
returns table(id uuid, archived_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
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
      where item.user_id = v_user_id
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
