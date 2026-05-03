-- set_updated_at shared function (idempotent)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Recreate trigger on items using the shared function
drop trigger if exists set_updated_at on items;
create trigger items_set_updated_at before update on items
  for each row execute function public.set_updated_at();

-- Add new columns to items
alter table items
  add column if not exists category_id uuid references categories(id) on delete set null,
  add column if not exists storage_location_id uuid references storage_locations(id) on delete set null,
  add column if not exists units int not null default 1 check (units >= 0),
  add column if not exists content_amount numeric(12,2) not null default 1 check (content_amount > 0),
  add column if not exists content_unit text not null default '個',
  add column if not exists opened_remaining numeric(12,2) check (opened_remaining is null or opened_remaining >= 0),
  add column if not exists image_path text;

-- Migrate existing quantity → units
update items set units = quantity where units = 1;

-- Drop deprecated columns
alter table items
  drop column if exists quantity,
  drop column if exists category,
  drop column if exists storage_location,
  drop column if exists image_url;

-- Add new indexes
create index if not exists items_category_idx on items(category_id);
create index if not exists items_location_idx on items(storage_location_id);
