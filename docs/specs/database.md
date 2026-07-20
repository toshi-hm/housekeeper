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
| `item_lots`                | 購入ロット（数量・単価・期限）          | ✅   | item 削除で CASCADE                           |
| `categories`               | カテゴリマスタ                          | ✅   | items.category_id = NULL                      |
| `storage_locations`        | 保管場所マスタ                          | ✅   | items.storage_location_id = NULL              |
| `custom_units`             | カスタム単位マスタ                      | v1.1 | 削除は items に影響しない（FK ではない）      |
| `consumption_logs`         | 消費イベント履歴                        | ✅   | item 削除で CASCADE                           |
| `user_settings`            | ユーザー設定（言語/閾値/通知時刻 など） | ✅   | user 削除で CASCADE                           |
| `shopping_list_items`      | 買い物リスト                            | v1.1 | item 削除で SET NULL（補充元 / 生成先ともに） |
| `shopping_list_archive`    | 買い物リストの購入履歴アーカイブ        | v1.2 | user 削除で CASCADE（行自体は不変・更新なし） |
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
  minimum_stock int check (minimum_stock is null or minimum_stock >= 0), -- ダッシュボード警告用
  auto_reorder boolean not null default false,   -- 定期購入フラグ（#353）
  reorder_threshold int check (reorder_threshold is null or reorder_threshold >= 0), -- 自動追加のしきい値。NULL = 0以下
  last_verified_at timestamptz,          -- 棚卸し（在庫確認）: 「在庫確認済み」ボタンで現在時刻に更新 (#375)
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

## item_lots

`items` 1 件は複数の購入ロット（`item_lots`）から構成される。ロットごとに数量・単価・購入日・賞味期限を
個別に持ち、`items` 側の集計値（`units` / `opened_remaining` / `expiry_date`）はロットから再計算される
（`syncItemAggregate`、`src/hooks/useItemLots.ts`）。

```sql
create table item_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  units int not null default 1 check (units >= 0),
  opened_remaining numeric(12,2) check (opened_remaining is null or opened_remaining >= 0),
  unit_price integer check (unit_price is null or unit_price >= 0),
  purchase_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_lots_item_idx on item_lots(item_id, created_at asc);
create index item_lots_user_idx on item_lots(user_id);
create index item_lots_expiry_idx on item_lots(expiry_date);
```

- `unit_price`（円単位の整数）: 1 点あたりの購入単価。**任意入力**、`NULL` = 未設定（#342）。
  - 既存ロットは全て `NULL`（後方互換）。集計時は `unit_price IS NULL` のロットを除外する。
  - 購入時（ロット追加フォーム / `PurchaseDialog`）に入力できる。編集はロット単位（`useUpdateLot`）。
- RLS は `item_lots.item_id` が呼び出しユーザー所有の `items` 行を指すことも `using` / `with check` 双方で検証する
  （テナント越えの参照を防止）。

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

## custom_units（v1.1）

```sql
create table custom_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (
    name = btrim(name)
    and char_length(name) between 1 and 40
    and name <> all (array['個', '枚', '本', '袋', 'mL', 'L', 'g', 'kg']::text[])
  ),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index custom_units_user_id_idx on custom_units(user_id);
```

- `items.content_unit` のプリセット `CONTENT_UNITS`（`個`/`枚`/`本`/`袋`/`mL`/`L`/`g`/`kg`）を
  ユーザーごとに拡張するマスタ（例: `缶`/`パック`/`食`/`錠`/`ロール`）
- `items.content_unit` はこのテーブルへの外部キーではなく **単なる text のコピー**。
  そのため categories/storage_locations と異なり `updated_at` トリガや「使用中チェック」は不要 —
  カスタム単位を削除しても既存アイテムの `content_unit` 値はそのまま残る
- 一覧表示は `CONTENT_UNITS`（プリセット）+ `custom_units`（ユーザー定義）のマージ
- Data API は `authenticated` に `select` / `insert` / `delete` のみ許可し、`anon` には許可しない。
  RLS も `authenticated` に限定し、`auth.uid() = user_id` を `using` / `with check` の両方で検証する

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
  occurred_at timestamptz not null default now(),
  note text
);

create index consumption_logs_item_idx on consumption_logs(item_id, occurred_at desc);
create index consumption_logs_user_idx on consumption_logs(user_id, occurred_at desc);
```

- `delta_unit` は item の `content_unit` と一致するのが基本だが、将来単位換算を入れる余地のため別カラムにしている
- ログから状態は復元できる（`units_after` / `opened_remaining_after`）
- `note`（#418）: 消費画面で入力する任意メモ。「消費理由プリセット」チップ（料理で使用 / 廃棄・期限切れ /
  贈り物 / その他）はこのカラムに専用の値を持たず、選択されたプリセットのラベルと自由記述を
  クライアント側で1本の文字列に結合してから保存する（プリセット単独 / 自由記述単独 / 組み合わせの
  いずれも可）。専用のenumカラムを追加していないのは、v1時点でプリセットの追加・文言変更を
  マイグレーションなしで行えるようにするため。

## user_settings

```sql
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'ja' check (language in ('ja','en')),
  expiry_warning_days int not null default 3 check (expiry_warning_days >= 0),
  default_unit text not null default 'mL',
  notify_at time not null default '08:00',
  auto_archive_after_days int check (auto_archive_after_days is null or auto_archive_after_days between 1 and 365),
  low_stock_forecast_days int not null default 7 check (low_stock_forecast_days >= 0), -- #68, #392: 消費ペースからの予測残日数の警告閾値
  stocktake_alert_enabled boolean not null default false,   -- 棚卸し未確認アラート ON/OFF (#375)
  stocktake_alert_days int not null default 90 check (stocktake_alert_days >= 1), -- 未確認とみなすまでの日数
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- 1 user 1 行。サインアップ時にトリガで自動挿入する想定（または初回アクセスで upsert）
- `auto_archive_after_days`: 期限切れアイテムの自動アーカイブ機能（#419）の設定値。`null`（デフォルト）= 無効、
  1以上の整数 = 期限切れからその日数が経過した `items` を自動的にソフトデリート（`deleted_at` セット）する猶予日数。
  実行はサーバーcronではなく**クライアントサイド**（ダッシュボード初期表示時）が担う。詳細は
  `docs/specs/features/expiry-alert.md` を参照。
- `low_stock_forecast_days` は `20260719000001_add_low_stock_forecast_days.sql` で追加（既存 `expiry_warning_days` とは独立の閾値）

## shopping_list_items（v1.1）

```sql
create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_units int not null default 1 check (desired_units >= 1),
  note text,
  linked_item_id uuid references items(id) on delete set null,
  auto_added boolean not null default false,
  status text not null check (status in ('planned','purchased')) default 'planned',
  purchased_at timestamptz,
  created_item_id uuid references items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_user_status_idx on shopping_list_items(user_id, status, created_at desc);
create unique index shopping_planned_linked_item_unique
  on shopping_list_items(user_id, linked_item_id)
  where status = 'planned' and linked_item_id is not null;
```

`auto_added` は定期購入処理が作成した行の出所を保持する。`linked_item_id` は手動補充でも使うため、
この列を推測には使用しない。

## shopping_list_archive（v1.2）

「購入済みをクリア」実行時に、削除前の `shopping_list_items`（`status='purchased'`）行をコピーして保存する購入履歴。
`items` の実体は複製しない（`name` / `desired_units` / `note` のみのスナップショット）ため、
その後 item 自体が削除・改名されても履歴表示には影響しない。

```sql
create table shopping_list_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_units int not null default 1 check (desired_units >= 1),
  note text,
  archived_at timestamptz not null default now()
);

create index shopping_list_archive_user_archived_idx
  on shopping_list_archive(user_id, archived_at desc);
```

- 同一の「購入済みをクリア」操作でアーカイブされた行は、クライアントが生成した単一の `archived_at` を共有する
  （設定 > 購入履歴 で「日付別グループ」表示するための下地）
- 行は insert のみ・更新なし（`updated_at` カラムを持たない。`consumption_logs` と同じ方針）
- 「再購入」操作は、この行の `name` / `desired_units` / `note` を使って `shopping_list_items` に
  `status='planned'` の新規行（または既存 planned 行との重複統合）を作るだけで、アーカイブ行自体は変更しない

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
