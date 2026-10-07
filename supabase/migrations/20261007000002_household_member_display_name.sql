-- 世帯メンバーの表示名 (#1182)。メンバー一覧・削除確認でオーナーが誰かを識別できるようにする。
-- household_members にはクライアント向け write ポリシーが無いため、本人のみ更新できる
-- security definer RPC 経由でのみ変更できる。
--
-- Error codes (SQLSTATE):
--   HK014  display name must be 1-30 characters (NULL / blank clears it)

alter table public.household_members
  add column display_name text
  constraint household_members_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 30);

create or replace function public.set_household_member_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_name is not null and char_length(v_name) > 30 then
    raise exception 'display name must be 1-30 characters' using errcode = 'HK014';
  end if;

  update public.household_members
  set display_name = v_name
  where user_id = v_user_id;
end;
$$;

revoke all on function public.set_household_member_display_name(text) from public, anon;
grant execute on function public.set_household_member_display_name(text) to authenticated;
