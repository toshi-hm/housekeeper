# Database Spec

> 本ファイルは housekeeper の **データモデル SOT (Single Source of Truth)**。
> migration ファイル名や個々の SQL は実装時に追加するが、**列名・型・制約・関係はここを優先**する。

## Provider

Supabase (Postgres 15+)
すべての書き込みはクライアントから直接（PostgREST / Supabase JS）。RLS で完全に隔離する。

## 共通ルール

- すべてのテーブルに `user_id uuid not null references auth.users(id) on delete cascade`
- すべてのテーブルで RLS を有効化し、ポリシーは原則 `using (auth.uid() = user_id) with check (auth.uid() = user_id)`
- すべてのテーブルに `created_at timestamptz not null default now()`、更新が頻繁な行は `updated_at timestamptz not null default now()` + トリガで自動更新
- `id` は `uuid primary key default gen_random_uuid()`
- 削除戦略は各テーブルの「削除動作」節を参照

## テーブル一覧

| テーブル                   | 役割                                    | MVP  | 削除動作（参照元 → 自身）                     |
| -------------------------- | --------------------------------------- | ---- | --------------------------------------------- |
| `items`                    | 在庫アイテム                            | ✅   | カテゴリ/場所マスタ削除で SET NULL            |
| `categories`               | カテゴリマスタ                          | ✅   | items.category_id = NULL                      |
| `storage_locations`        | 保管場所マスタ                          | ✅   | items.storage_location_id = NULL              |
| `consumption_logs`         | 消費イベント履歴                        | ✅   | item 削除で CASCADE                           |
| `user_settings`            | ユーザー設定（言語/閾値/通知時刻 など） | ✅   | user 削除で CASCADE                           |
| `shopping_list_items`      | 買い物リスト                            | v1.1 | item 削除で SET NULL（補充元 / 生成先ともに） |
| `notification_preferences` | 通知 ON/OFF                             | v1.2 | user 削除で CASCADE                           |
| `push_subscriptions`       | Web Push 購読                           | v1.2 | user 削除で CASCADE                           |

---

## items

```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  barcode text,
  category_id uuid references categories(id) on delete set null,
  storage_location_id uuid references storage_locations(id) on delete set null,

  -- 数量モデル
  units int not null default 1 check (units >= 0),
  content_amount numeric(12,2) not null default 1 check (content_amount > 0),
  content_unit text not null default '個',
  opened_remaining numeric(12,2) check (opened_remaining is null or opened_remaining >= 0),

  purchase_date date,
  expiry_date date,
  notes text,
  image_path text,                       -- Storage 内のオブジェクトキー（"<user_id>/<item_id>.<ext>"）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_id_idx on items(user_id);
create index items_expiry_date_idx on items(expiry_date);
create index items_barcode_idx on items(barcode);
create index items_category_idx on items(category_id);
create index items_location_idx on items(storage_location_id);
```

- `image_path` は Storage バケット `item-images` の **オブジェクトキー**（公開 URL ではなく）
- `opened_remaining = null` は「未開封」、`numeric` 値は「開封中で残量あり」、`0` は「開封済み・空（次の点に移行直前）」
- 既存 `quantity` カラムは v1 移行時に `units` へ変換し DROP

## categories

```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,                            -- hex color or token
  icon text,                             -- lucide icon name など任意
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index categories_user_id_idx on categories(user_id);
```

## storage_locations

```sql
create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index storage_locations_user_id_idx on storage_locations(user_id);
```

## consumption_logs

```sql
create table consumption_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  delta_amount numeric(12,2) not null check (delta_amount > 0),
  delta_unit text not null,
  units_before int not null,
  units_after int not null,
  opened_remaining_before numeric(12,2),
  opened_remaining_after numeric(12,2),
  occurred_at timestamptz not null default now()
);

create index consumption_logs_item_idx on consumption_logs(item_id, occurred_at desc);
create index consumption_logs_user_idx on consumption_logs(user_id, occurred_at desc);
```

- `delta_unit` は item の `content_unit` と一致するのが基本だが、将来単位換算を入れる余地のため別カラムにしている
- ログから状態は復元できる（`units_after` / `opened_remaining_after`）

## user_settings

```sql
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'ja' check (language in ('ja','en')),
  expiry_warning_days int not null default 3 check (expiry_warning_days >= 0),
  default_unit text not null default 'mL',
  notify_at time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- 1 user 1 行。サインアップ時にトリガで自動挿入する想定（または初回アクセスで upsert）

## shopping_list_items（v1.1）

```sql
create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_units int not null default 1 check (desired_units >= 1),
  note text,
  linked_item_id uuid references items(id) on delete set null,
  status text not null check (status in ('planned','purchased')) default 'planned',
  purchased_at timestamptz,
  created_item_id uuid references items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_user_status_idx on shopping_list_items(user_id, status, created_at desc);
```

## notification_preferences（v1.2）

```sql
create table notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  threshold_days int not null default 3 check (threshold_days >= 0),
  notify_at time not null default '08:00',
  updated_at timestamptz not null default now()
);
```

## push_subscriptions（v1.2）

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions(user_id);
```

---

## RLS ポリシーひな形

```sql
alter table items enable row level security;
create policy "items_owner_all" on items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 他テーブルも同様
```

## updated_at トリガひな形

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at before update on items
  for each row execute function public.set_updated_at();

-- categories / storage_locations / shopping_list_items / user_settings に同様適用
```

---

## Storage

### バケット `item-images`

- 種別: **private**
- パス規約: `<user_id>/<item_id>.<ext>`（`ext` は `webp` / `jpg` / `png`）
- アクセス: `supabase.storage.from('item-images').createSignedUrl(path, 3600)` を `useUploadItemImage` / `ItemImage` 経由で取得
- アップロード上限: 5 MB（クライアント側で検証）

### Storage RLS ポリシー（概念）

```sql
create policy "item_images_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "item_images_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- update / delete も同様
```

---

## マイグレーションの方針

- Supabase CLI のマイグレーションファイル `supabase/migrations/<timestamp>_<name>.sql` で管理
- v1 で必要な変更は **複数の小さなマイグレーション** に分割（categories → storage_locations → items 拡張 → consumption_logs → user_settings → storage バケット）
- 既存 `items.quantity` のデータは:
  1. `units` カラム追加（default 1）
  2. `update items set units = quantity`
  3. `quantity` を drop
     この順で安全に移行
