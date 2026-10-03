-- Finish household scoping for the remaining shareable data (#64).
-- Storage object keys remain user-scoped until a separate verified copy/remove
-- migration is designed; no object data is moved here.

alter table public.shopping_list_items add column household_id uuid references public.households(id) on delete cascade;
alter table public.shopping_list_archive add column household_id uuid references public.households(id) on delete cascade;
alter table public.shopping_list_templates add column household_id uuid references public.households(id) on delete cascade;
alter table public.shopping_list_template_items add column household_id uuid references public.households(id) on delete cascade;
alter table public.recipes add column household_id uuid references public.households(id) on delete cascade;
alter table public.recipe_items add column household_id uuid references public.households(id) on delete cascade;

update public.shopping_list_items s set household_id = hm.household_id from public.household_members hm where hm.user_id = s.user_id;
update public.shopping_list_archive s set household_id = hm.household_id from public.household_members hm where hm.user_id = s.user_id;
update public.shopping_list_templates s set household_id = hm.household_id from public.household_members hm where hm.user_id = s.user_id;
update public.shopping_list_template_items s set household_id = hm.household_id from public.household_members hm where hm.user_id = s.user_id;
update public.recipes r set household_id = hm.household_id from public.household_members hm where hm.user_id = r.user_id;
update public.recipe_items ri set household_id = r.household_id from public.recipes r where r.id = ri.recipe_id;

alter table public.shopping_list_items alter column household_id set not null;
alter table public.shopping_list_archive alter column household_id set not null;
alter table public.shopping_list_templates alter column household_id set not null;
alter table public.shopping_list_template_items alter column household_id set not null;
alter table public.recipes alter column household_id set not null;
alter table public.recipe_items alter column household_id set not null;

create index shopping_list_items_household_idx on public.shopping_list_items(household_id, status, created_at desc);
create index shopping_list_archive_household_idx on public.shopping_list_archive(household_id, archived_at desc);
create index shopping_list_templates_household_idx on public.shopping_list_templates(household_id, created_at desc);
create index shopping_list_template_items_household_idx on public.shopping_list_template_items(household_id, template_id);
create index recipes_household_idx on public.recipes(household_id, created_at desc);
create index recipe_items_household_idx on public.recipe_items(household_id, recipe_id);

-- Keep the existing per-creator name uniqueness. Households can contain rows
-- created by different users with the same name; rejecting those duplicates
-- would make backfill fail for data that was valid before sharing.

create trigger shopping_list_items_assign_household before insert or update of household_id, user_id on public.shopping_list_items for each row execute function private.assign_current_household_id();
create or replace function private.assign_shopping_archive_household_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
begin
  if v_household_id is null then
    raise exception 'user does not belong to a household' using errcode = '42501';
  end if;

  if new.household_id is not null and new.household_id <> v_household_id then
    raise exception 'row household does not match current membership' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'creator cannot be changed' using errcode = '42501';
  end if;

  new.household_id := v_household_id;
  return new;
end;
$$;

revoke all on function private.assign_shopping_archive_household_id() from public, anon;
grant execute on function private.assign_shopping_archive_household_id() to authenticated;

create trigger shopping_list_archive_assign_household before insert or update of household_id, user_id on public.shopping_list_archive for each row execute function private.assign_shopping_archive_household_id();
create trigger shopping_list_templates_assign_household before insert or update of household_id, user_id on public.shopping_list_templates for each row execute function private.assign_current_household_id();
create trigger shopping_list_template_items_assign_household before insert or update of household_id, user_id on public.shopping_list_template_items for each row execute function private.assign_current_household_id();
create trigger recipes_assign_household before insert or update of household_id, user_id on public.recipes for each row execute function private.assign_current_household_id();

create or replace function private.assign_recipe_item_household_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
begin
  if v_household_id is null then
    raise exception 'user does not belong to a household' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = new.recipe_id and r.household_id = v_household_id
  ) then
    raise exception 'recipe does not belong to current household' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.items i
    where i.id = new.item_id and i.household_id = v_household_id
  ) then
    raise exception 'item does not belong to current household' using errcode = '42501';
  end if;

  if new.household_id is not null and new.household_id <> v_household_id then
    raise exception 'row household does not match current membership' using errcode = '42501';
  end if;

  new.household_id := v_household_id;
  return new;
end;
$$;

revoke all on function private.assign_recipe_item_household_id() from public, anon;
grant execute on function private.assign_recipe_item_household_id() to authenticated;

create trigger recipe_items_assign_household before insert or update of household_id, recipe_id, item_id on public.recipe_items for each row execute function private.assign_recipe_item_household_id();

drop policy "Users can manage their own shopping list" on public.shopping_list_items;
create policy shopping_list_items_household_all on public.shopping_list_items for all to authenticated
  using (
    household_id = (select private.current_household_id())
    and (linked_item_id is null or exists (select 1 from public.items i where i.id = shopping_list_items.linked_item_id and i.household_id = shopping_list_items.household_id))
    and (created_item_id is null or exists (select 1 from public.items i where i.id = shopping_list_items.created_item_id and i.household_id = shopping_list_items.household_id))
  )
  with check (
    household_id = (select private.current_household_id())
    and (linked_item_id is null or exists (select 1 from public.items i where i.id = shopping_list_items.linked_item_id and i.household_id = shopping_list_items.household_id))
    and (created_item_id is null or exists (select 1 from public.items i where i.id = shopping_list_items.created_item_id and i.household_id = shopping_list_items.household_id))
  );

drop policy "shopping_list_archive_owner_all" on public.shopping_list_archive;
create policy shopping_list_archive_household_all on public.shopping_list_archive for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));
revoke insert on public.shopping_list_archive from public, anon, authenticated;

drop policy "shopping_list_templates_owner_all" on public.shopping_list_templates;
create policy shopping_list_templates_household_all on public.shopping_list_templates for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "shopping_list_template_items_owner_all" on public.shopping_list_template_items;
create policy shopping_list_template_items_household_all on public.shopping_list_template_items for all to authenticated
  using (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.shopping_list_templates t where t.id = shopping_list_template_items.template_id and t.household_id = shopping_list_template_items.household_id)
  )
  with check (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.shopping_list_templates t where t.id = shopping_list_template_items.template_id and t.household_id = shopping_list_template_items.household_id)
  );

drop policy "recipes_owner_all" on public.recipes;
create policy recipes_household_all on public.recipes for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "recipe_items_owner_all" on public.recipe_items;
create policy recipe_items_household_all on public.recipe_items for all to authenticated
  using (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.recipes r where r.id = recipe_items.recipe_id and r.household_id = recipe_items.household_id)
    and exists (select 1 from public.items i where i.id = recipe_items.item_id and i.household_id = recipe_items.household_id)
  )
  with check (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.recipes r where r.id = recipe_items.recipe_id and r.household_id = recipe_items.household_id)
    and exists (select 1 from public.items i where i.id = recipe_items.item_id and i.household_id = recipe_items.household_id)
  );

create or replace function public.archive_purchased_shopping_items()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_count integer;
  v_household_id uuid := private.current_household_id();
begin
  if auth.uid() is null or v_household_id is null then
    raise exception 'user does not belong to a household' using errcode = '42501';
  end if;

  with moved_rows as (
    delete from public.shopping_list_items
    where household_id = v_household_id
      and status = 'purchased'
    returning user_id, household_id, name, desired_units, note
  )
  insert into public.shopping_list_archive (user_id, household_id, name, desired_units, note, archived_at)
  select user_id, household_id, name, desired_units, note, statement_timestamp()
  from moved_rows;

  get diagnostics v_archived_count = row_count;
  return v_archived_count;
end;
$$;

revoke all on function public.archive_purchased_shopping_items() from public, anon;
grant execute on function public.archive_purchased_shopping_items() to authenticated;

create or replace function public.save_shopping_list_template(p_id uuid, p_name text, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_household_id uuid := private.current_household_id();
begin
  if p_id is null then
    insert into public.shopping_list_templates (user_id, household_id, name)
    values ((select auth.uid()), v_household_id, p_name)
    returning id into v_template_id;
  else
    update public.shopping_list_templates
    set name = p_name
    where id = p_id and household_id = v_household_id
    returning id into v_template_id;

    if v_template_id is null then
      raise exception 'template not found' using errcode = 'HK003';
    end if;
  end if;

  delete from public.shopping_list_template_items where template_id = v_template_id;

  insert into public.shopping_list_template_items (template_id, user_id, household_id, name, desired_units)
  select v_template_id, (select auth.uid()), v_household_id, item ->> 'name', (item ->> 'desired_units')::int
  from jsonb_array_elements(p_items) as item;

  return v_template_id;
end;
$$;

create or replace function public.save_recipe(p_id uuid, p_name text, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipe_id uuid;
  v_household_id uuid := private.current_household_id();
begin
  if p_id is null then
    insert into public.recipes (user_id, household_id, name)
    values ((select auth.uid()), v_household_id, p_name)
    returning id into v_recipe_id;
  else
    update public.recipes
    set name = p_name
    where id = p_id and household_id = v_household_id
    returning id into v_recipe_id;

    if v_recipe_id is null then
      raise exception 'recipe not found' using errcode = 'HK003';
    end if;
  end if;

  delete from public.recipe_items where recipe_id = v_recipe_id;

  insert into public.recipe_items (recipe_id, item_id, household_id, amount)
  select v_recipe_id, (item ->> 'item_id')::uuid, v_household_id, (item ->> 'amount')::numeric
  from jsonb_array_elements(p_items) as item;

  return v_recipe_id;
end;
$$;
