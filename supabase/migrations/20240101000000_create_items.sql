-- Housekeeper: Home Inventory Management
-- Run this migration in your Supabase project's SQL Editor

-- Items table
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  barcode text,
  category text,
  quantity integer not null default 1,
  storage_location text,
  purchase_date date,
  expiry_date date,
  notes text,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table items enable row level security;

-- Policy: users can only access their own items
create policy "Users can only access their own items"
  on items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Automatically update updated_at timestamp
create or replace function public.items_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on items
  for each row
  execute function public.items_set_updated_at();

-- Indexes for common queries
create index if not exists items_user_id_idx on items(user_id);
create index if not exists items_expiry_date_idx on items(expiry_date);
create index if not exists items_barcode_idx on items(barcode);
