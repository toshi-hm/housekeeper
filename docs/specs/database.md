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

| テーブル                              | 役割                                     | MVP  | 削除動作（参照元 → 自身）                           |
| ------------------------------------- | ---------------------------------------- | ---- | --------------------------------------------------- |
| `items`                               | 在庫アイテム                             | ✅   | カテゴリ/場所マスタ削除で SET NULL                  |
| `item_lots`                           | 購入ロット（数量・単価・期限）           | ✅   | item 削除で CASCADE                                 |
| `categories`                          | カテゴリマスタ                           | ✅   | items.category_id = NULL                            |
| `storage_locations`                   | 保管場所マスタ                           | ✅   | items.storage_location_id = NULL                    |
| `custom_units`                        | カスタム単位マスタ                       | v1.1 | 削除は items に影響しない（FK ではない）            |
| `consumption_logs`                    | 消費イベント履歴                         | ✅   | item 削除で CASCADE                                 |
| `user_settings`                       | ユーザー設定（言語/閾値/通知時刻 など）  | ✅   | user 削除で CASCADE                                 |
| `shopping_list_items`                 | 買い物リスト                             | v1.1 | item 削除で SET NULL（補充元 / 生成先ともに）       |
| `shopping_list_archive`               | 買い物リストの購入履歴アーカイブ         | v1.2 | user 削除で CASCADE（行自体は不変・更新なし）       |
| `notification_preferences`            | 通知 ON/OFF                              | v1.2 | user 削除で CASCADE                                 |
| `push_subscriptions`                  | Web Push 購読                            | v1.2 | user 削除で CASCADE                                 |
| `recipes`                             | レシピ/セット消費のテンプレート          | v1.3 | user 削除で CASCADE                                 |
| `recipe_items`                        | レシピの構成アイテムと消費量             | v1.3 | recipe 削除で CASCADE / item 削除で CASCADE         |
| `floor_plans`                         | ユーザー共通の家全体2D間取りの意味モデル | v1.9 | user 削除で CASCADE                                 |
| `floor_plan_storage_location_markers` | 共通間取り上の保管場所マーカー           | v1.9 | floor_plan / storage_location / user 削除で CASCADE |
| `floor_plan_item_placements`          | 間取り上の在庫配置                       | v1.9 | floor_plan / item / user 削除で CASCADE             |

---

## items

```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  barcode text,
  category_id uuid references categories(id) on delete set null,
  item_type text check (item_type is null or item_type in ('food', 'daily_goods')), -- 食料品/日用品の個別上書き。null = categories.kind に従う（item-type.md）
  storage_location_id uuid references storage_locations(id) on delete set null,

  -- 数量モデル
  units int not null default 1 check (units >= 0),
  content_amount numeric(12,2) not null default 1 check (content_amount > 0),
  content_unit text not null default '個',
  opened_remaining numeric(12,2) check (opened_remaining is null or opened_remaining >= 0),

  purchase_date date,
  expiry_date date,
  expiry_type text check (expiry_type is null or expiry_type in ('best_before', 'use_by')), -- 賞味期限/消費期限の区別。null = 区別なし（既存アイテム互換, #714）
  notes text,
  image_path text,                       -- Storage 内のオブジェクトキー（"<user_id>/<item_id>.<ext>"）
  minimum_stock int check (minimum_stock is null or minimum_stock >= 0), -- ダッシュボード警告用
  auto_reorder boolean not null default false,   -- 定期購入フラグ（#353）
  reorder_threshold int check (reorder_threshold is null or reorder_threshold >= 0), -- 自動追加のしきい値。NULL = 0以下
  reorder_lead_days int check (reorder_lead_days is null or reorder_lead_days >= 0), -- 消費ペース予測に基づく自動追加のしきい値（日数）。NULL = 予測残日数による自動追加を使わない（#853）
  last_verified_at timestamptz,          -- 棚卸し（在庫確認）: 「在庫確認済み」ボタンで現在時刻に更新 (#375)
  deleted_at timestamptz,                -- ソフトデリート（null = 生存）
  deletion_reason text check (deletion_reason is null or deletion_reason in ('consumed', 'expired_waste', 'other')), -- 削除理由（フードロス集計用, #494）
  pin_x numeric(4,3) check (pin_x is null or (pin_x >= 0 and pin_x <= 1)), -- 保管場所写真上の相対位置（収納マップ, #574）
  pin_y numeric(4,3) check (pin_y is null or (pin_y >= 0 and pin_y <= 1)),
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
- `deleted_at` はソフトデリート日時。`deleted_at is null` を通常のクエリ（一覧・詳細・カレンダー）で常にフィルタ条件に含める
- `deletion_reason`（#494）: ソフトデリート時に選択させる削除理由。`'consumed'`（使い切った） / `'expired_waste'`（期限切れで廃棄） / `'other'`（その他）。既存の理由未選択のソフトデリート行は `null` のまま残る。フードロスダッシュボード（`docs/specs/features/stats.md`）は `deletion_reason = 'expired_waste'` の行のみを集計対象にする。`units` / `content_amount` / `opened_remaining` はソフトデリート時に変更されないため、廃棄時点の推定残量はこれらのカラムから逆算できる（専用カラムは追加していない）
- `pin_x` / `pin_y`（#574）: 保管場所（`storage_locations.photo_path`）の写真上の相対位置。左上を `(0, 0)`、
  右下を `(1, 1)` とする。保管場所に写真が未登録、または位置未指定の場合は両方 `null`。
  詳細は `docs/specs/features/storage-location-map.md` を参照
- `expiry_type`（#714）: 「賞味期限」（`best_before`, 品質の目安）と「消費期限」（`use_by`,
  安全性の目安）の区別。`null` = 未設定（既存アイテムはこのまま、区別なしの従来挙動を維持）。
  詳細は `docs/specs/features/expiry-alert.md` を参照
- `item_type`: 食料品（`food`） / 日用品（`daily_goods`）の区別のアイテム個別上書き。
  `null` = `categories.kind` に従う（カテゴリ未設定なら `food`）。既存アイテムは全て `null`。
  詳細は `docs/specs/features/item-type.md` を参照

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
  store_name text,
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
- `store_name`（自由入力テキスト）: 購入先の店舗名。**任意入力**、`NULL` = 未設定（#697）。
  - 既存ロットは全て `NULL`（後方互換）。トリムした文字列として保持する（空文字は `NULL` に正規化）。
  - `useStoreNameSuggestions()` が自ユーザーの distinct 値をサジェストする。
  - `unit_price` と `store_name` が揃ったロットが同一アイテムで複数店舗ぶんあると、
    `useStorePriceComparisons()`（統計ページ用、全アイテム横断の集計）が店舗別の直近単価一覧
    （安い順）を返す。
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
  kind text not null default 'food' check (kind in ('food', 'daily_goods')), -- このカテゴリの既定のアイテム種別（item-type.md）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index categories_user_id_idx on categories(user_id);
```

- `kind`: このカテゴリに属するアイテムの既定の種別（食料品 / 日用品）。
  `items.item_type` が `null` のアイテムはこの値にフォールバックする
  （`resolveItemType`、`docs/specs/features/item-type.md`）。
  `not null default 'food'` なので既存カテゴリは全て食料品扱いのまま。
- `days_use_after_opening`（#752）も同じ「カテゴリ既定 + アイテム個別上書き」の構造を取る

## storage_locations

```sql
create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  photo_path text,                       -- Storage バケット location-photos のオブジェクトキー（収納マップ, #574）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index storage_locations_user_id_idx on storage_locations(user_id);
```

- `photo_path` は保管場所の「収納マップ」写真（`docs/specs/features/storage-location-map.md`）。
  未登録時は `null`

## floor_plans（v1.9）

2D間取りの正本。描画ライブラリ固有のJSONではなく、Zodで検証するアプリ固有の意味モデルを `document` に保持する。
3D表示はこの文書をクライアント側で押し出して生成し、3D専用の正本は持たない。

```sql
create table floor_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_location_id uuid references storage_locations(id) on delete set null, -- 旧クライアント互換用。新規コードはマーカーを使う
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  schema_version integer not null default 1 check (schema_version = 1),
  document jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index floor_plans_user_id_idx on floor_plans(user_id);

alter table floor_plans enable row level security;

create policy "floor_plans_owner_all" on floor_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Data API経由の認証済みクライアントから利用するため、`authenticated` に必要なCRUD権限を付与する。RLSは別途有効化し、所有者以外の行を返さない。

`document` の必須構造は `src/types/floorPlan.ts` と `docs/specs/features/floor-plan-map.md` をSOTとする。
DBはJSON内部の座標や図形種別を完全には検証せず、読み込み時・保存前にZodで検証する。未知の `schema_version` は表示せず、移行導線を出す。

- 1ユーザーにつき1共通間取り。将来複数階や複数間取りが必要になった場合は `floor_plan_levels` を追加する。
- `revision` は複数タブ／端末による上書きを検知するための楽観ロック値。
- `storage_location_id` は旧クライアント互換の非推奨列で、新規コードでは使用しない。保管場所の正本はマーカー。
- 写真マップの `photo_path` と `items.pin_x/pin_y` は既存互換のため変更しない。

## floor_plan_storage_location_markers（v1.9）

共通間取り上の保管場所の位置を保持する。1つの保管場所は共通間取り上に最大1つのマーカーを持つ。

```sql
create table floor_plan_storage_location_markers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  floor_plan_id uuid not null references floor_plans(id) on delete cascade,
  storage_location_id uuid not null references storage_locations(id) on delete cascade,
  object_id text,
  x numeric(12,3) not null check (x >= 0),
  y numeric(12,3) not null check (y >= 0),
  z numeric(12,3) not null default 0 check (z >= 0),
  rotation numeric(8,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_plan_id, storage_location_id)
);
```

RLSは `user_id`、参照先の `floor_plans.user_id`、`storage_locations.user_id` がすべて `auth.uid()` であることを検証する。`authenticated` へのCRUD権限とRealtime publication登録を行う。

## floor_plan_item_placements（v1.9）

間取り文書と在庫の責務を分離する中間テーブル。アイテム名変更・削除後も文書を破壊しない。

```sql
create table floor_plan_item_placements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  floor_plan_id uuid not null references floor_plans(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  object_id text,
  x numeric(12,3) not null check (x >= 0),
  y numeric(12,3) not null check (y >= 0),
  z numeric(12,3) not null default 0 check (z >= 0),
  rotation numeric(8,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_plan_id, item_id)
);

create index floor_plan_item_placements_plan_idx
  on floor_plan_item_placements(floor_plan_id);
create index floor_plan_item_placements_item_idx
  on floor_plan_item_placements(item_id);

alter table floor_plan_item_placements enable row level security;

create policy "floor_plan_item_placements_owner_all"
  on floor_plan_item_placements for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from floor_plans plan
      where plan.id = floor_plan_item_placements.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from items item
      where item.id = floor_plan_item_placements.item_id
        and item.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from floor_plans plan
      where plan.id = floor_plan_item_placements.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from items item
      where item.id = floor_plan_item_placements.item_id
        and item.user_id = auth.uid()
    )
  );
```

配置テーブルにも `authenticated` のCRUD権限を付与する。Realtime購読を利用する場合は、両テーブルを `supabase_realtime` publication に登録する。権限付与はRLSを置き換えず、行単位の所有者検証と併用する。

初期版は配置の保存を1アイテム単位のmutationとする。複数図形・配置・履歴を1トランザクションで保存する要件が出た場合は、`save_floor_plan` RPC（`security invoker`、expected revision検証、`FOR UPDATE`）へ移行する。

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
  stocktake_alert_days int not null default 90 check (stocktake_alert_days between 1 and 365), -- 未確認とみなすまでの日数
  last_backup_export_at timestamptz, -- JSONエクスポート(唯一のバックアップ導線)の最終成功日時 (#815)
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
  timezone text not null default 'Asia/Tokyo', -- #660: notify_at の解釈に使うIANAタイムゾーン
  updated_at timestamptz not null default now()
);
```

## push_subscriptions（v1.2）

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on push_subscriptions(user_id);
```

`endpoint` は `user_id` との複合ユニーク（グローバルユニークではない）。同一端末・同一ブラウザを
複数ユーザーが共用する場合、`registration.pushManager.subscribe()` は同じ `endpoint` を返すため、
別ユーザーがそのendpointで再購読すると `subscribe-push` Edge Function が旧ユーザーの行を削除してから
自分の行をupsertする（同一デバイスの購読先は実質1ユーザーに紐づくため、旧ユーザー側は死んだ購読として
扱う。#826）。

## recipes / recipe_items（v1.3）

レシピ/セット消費機能（#393）。「朝のコーヒー」のようなテンプレートを登録し、
実行するだけで構成アイテムを一括消費できるようにする。

```sql
create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index recipes_user_idx on recipes(user_id, created_at desc);

create table recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index recipe_items_recipe_idx on recipe_items(recipe_id);
create index recipe_items_item_idx on recipe_items(item_id);
```

- `recipe_items` は `recipes` への従属エンティティのため、他テーブルと異なり
  **直接の `user_id` カラムを持たない**。所有権は `recipe_id` を介して
  `recipes.user_id` に対する join で判定する（RLS 節参照）。
- `amount` の単位は明示的なカラムを持たず、対象 `items.content_unit` に従う
  （例: コーヒー豆 `amount=15` は `content_unit='g'` の場合 15g を意味する）。
- 実行（一括消費）は専用テーブルを持たず、既存の消費ロジック
  (`consumeItem` / `docs/specs/features/consumption-purchase.md`) を
  構成アイテムごとに呼び出す。そのため実行履歴は各アイテムの
  `consumption_logs` に記録される（レシピ実行そのものをまとめて記録する
  専用ログは持たない — Backlog）。

---

## RLS ポリシーひな形

```sql
alter table items enable row level security;
create policy "items_owner_all" on items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 他テーブルも同様
```

### user_id を持たない従属テーブルの例（recipe_items）

`recipe_items` のように直接 `user_id` を持たないテーブルは、親テーブルへの
`exists` join で所有権を判定する。加えて、`item_id` のような**他テーブルへの
参照カラム**は FK 制約だけでは所有権を保証しない（FK は RLS より高い権限で
解決されるため、他ユーザーの行を指す `item_id` を推測して挿入できてしまう）。
参照先テーブルにも `exists` join で所有権を確認すること（#804、`item_lots`
と同じ「ownership via join」パターン）:

```sql
alter table recipe_items enable row level security;
create policy "recipe_items_owner_all" on recipe_items for all
  using (
    exists (
      select 1 from recipes r
      where r.id = recipe_items.recipe_id and r.user_id = auth.uid()
    )
    and exists (
      select 1 from items i
      where i.id = recipe_items.item_id and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from recipes r
      where r.id = recipe_items.recipe_id and r.user_id = auth.uid()
    )
    and exists (
      select 1 from items i
      where i.id = recipe_items.item_id and i.user_id = auth.uid()
    )
  );
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

### バケット `location-photos`（#574）

- 種別: **private**
- パス規約: `<user_id>/<location_id>.<ext>`（`ext` は `webp` / `jpg` / `png`）
- アクセス: `supabase.storage.from('location-photos').createSignedUrl(path, 3000)` を
  `useSignedLocationPhoto` 経由で取得
- アップロード上限: 5 MB（クライアント側で検証、`item-images` と共通の `ImageUploader` を流用）
- RLS ポリシーは `item-images` と同じ所有者チェックパターン（バケット名のみ置き換え）

---

## マイグレーションの方針

- Supabase CLI のマイグレーションファイル `supabase/migrations/<timestamp>_<name>.sql` で管理
- v1 で必要な変更は **複数の小さなマイグレーション** に分割（categories → storage_locations → items 拡張 → consumption_logs → user_settings → storage バケット）
- 既存 `items.quantity` のデータは:
  1. `units` カラム追加（default 1）
  2. `update items set units = quantity`
  3. `quantity` を drop
     この順で安全に移行

### 本番への適用（手動デプロイ手順）

- マイグレーションを本番へ適用する CI は **無い**。フロントエンドは Cloudflare Pages が
  自動デプロイするが、DB は `bun run db:push`（= `supabase db push`）を人が実行する必要がある
- **フロントのデプロイより先に（または同時に）適用する**。逆順にすると、アプリが
  マイグレーションで追加された列を送るのに DB 側に無く、PostgREST が `PGRST204` で
  書き込みを拒否する（アイテムの保存が失敗する）
- 未適用の確認: `bun run db:status`（= `supabase migration list`）
- `db:status` はマイグレーション **履歴テーブル** の比較なので、履歴が誤った version で
  記録されている場合はドリフトを見逃す。実スキーマとの突き合わせは
  `bun run gen:types` 後の `src/types/supabase.ts` の差分で確認する
- アプリ側は「DB にアプリの期待する列/RPC が無い」エラー（`PGRST204` / `PGRST202` /
  `42703` / `42P01` / `42883`）を `isSchemaMismatchError`（`src/lib/supabaseErrors.ts`）で
  判別し、汎用の「エラーが発生しました」ではなく適用漏れを示すメッセージを表示する

### 拡張（extension）の置き場所

- 拡張は **`public` ではなく `extensions` スキーマ**に入れる
  （`create extension ... with schema extensions`）。`pgcrypto` / `uuid-ossp` /
  `pg_stat_statements` はいずれも `extensions` にある
- 理由: `public` は PostgREST の公開スキーマ（`supabase/config.toml` の
  `schemas = ["public", "graphql_public"]`）なので、`public` に拡張を入れると
  その拡張が持ち込む関数がすべて `/rest/v1/rpc/<関数名>` として外部から到達可能に
  なる。拡張の関数は既定で PUBLIC に EXECUTE が付くため `anon` からも実行できる
- 実例（#840）: `20260720000006_enable_pgtap.sql` がスキーマ指定なしで pgTAP を
  入れており、`lives_ok(text)` / `throws_ok(text)` / `performs_ok(text, numeric)` /
  `_query(text)` のような **引数の文字列を SQL として実行する**関数を含む1000個超が
  anon から呼べる状態になっていた（security invoker なので権限昇格や RLS の
  バイパスは起きないが、任意SQL実行・スキーマ情報の漏洩・CPU 消費の口になる）。
  `20260812120000_move_pgtap_to_extensions.sql` で `extensions` へ移動済み
- pgTAP は `supabase test db`（`supabase/tests/database/*.test.sql`）専用の
  テスト依存で、アプリの実行時経路からは呼ばれない。`extensions` へ移しても
  `postgres` ロールの `search_path`（`"$user", public, extensions`）に含まれるため、
  テスト内の無修飾の `plan()` / `results_eq()` はそのまま解決される
