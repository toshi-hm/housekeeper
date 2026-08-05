-- #744: auto_archive_expired_items をユーザーのタイムゾーンで判定するよう修正
--
-- 従来は Postgres の current_date（サーバーのUTC日付）で expiry_date と比較していたため、
-- notification_preferences.timezone を考慮する send-expiry-notifications（#660）と挙動が
-- 食い違い、UTCから離れたタイムゾーンのユーザーで自動アーカイブのタイミングが最大±1日
-- ずれていた。notification_preferences に行が無いユーザー、または不正なタイムゾーン
-- 文字列が保存されている場合は、既存の既定値と同じ Asia/Tokyo にフォールバックする。

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
      returning item.id, v_archived_at;
end;
$$;
