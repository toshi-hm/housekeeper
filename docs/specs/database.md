# Database Spec

## Provider

Supabase (Postgres)

## Schema

```sql
create table items (
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

alter table items enable row level security;

create policy "Users can only access their own items"
on items for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## RLS Policy

All access is filtered by auth.uid() = user_id.
No server-side authorization logic needed.
