Create a new web application called "housekeeper" — a home inventory management app for tracking household goods and groceries.

## Tech Stack

**Attention 1: ** If you are adding a new library, always install the latest version.
**Attention 2: ** use "bun" if we manage libraries.

- **Build**: Vite
- **Language**: TypeScript (strict mode)
- **UI**: React 19
- **Routing**: TanStack Router (file-based routing)
- **DB/Auth**: Supabase (Postgres + RLS + Supabase Auth)
- **UI Kit**: Tailwind CSS v4 + shadcn/ui
- **Lint / format**: oxlint / oxfmt
- **Validation**: Zod
- **Server State**: TanStack Query v5
- **Hosting Target**: Cloudflare Pages (static export)

## Core Features

1. **Barcode scanning** — scan product barcodes via device camera to register items
2. **Product registration** — store product name, barcode, category, image
3. **Inventory management** — track quantity, storage location, purchase date, expiry date, notes per item
4. **Expiry alerts** — visually highlight items near or past expiry date
5. **Authentication** — Supabase Auth (email/password), single user assumed

## Database Schema (Supabase Postgres)

```sql
-- Users are managed by Supabase Auth

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

-- Enable RLS
alter table items enable row level security;

create policy "Users can only access their own items"
on items for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## Project Structure

```
src/
  routes/
    __root.tsx
    _auth.tsx          # layout: redirect to /login if not authenticated
    _auth.index.tsx    # dashboard / item list
    _auth.items.new.tsx
    _auth.items.$itemId.tsx
    _auth.items.$itemId.edit.tsx
    login.tsx
  components/
    ui/                # shadcn/ui components
    BarcodeScanner.tsx
    ItemCard.tsx
    ItemForm.tsx
    ExpiryBadge.tsx
  lib/
    supabase.ts        # Supabase client
    queryClient.ts     # TanStack Query client
  hooks/
    useItems.ts
    useBarcodeLookup.ts
  types/
    item.ts
```

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Additional Notes

- All Supabase access is client-side only (no backend server)
- Barcode lookup via external API should be proxied through Supabase Edge Functions to avoid CORS
- Use `@zxing/browser` or `html5-qrcode` for barcode scanning
- Items expiring within 3 days should be visually highlighted
- Items past expiry date should be clearly marked
- Mobile-first UI (primary use case is scanning on a smartphone)
