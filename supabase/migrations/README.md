# supabase/migrations

このディレクトリの `.sql` ファイルが、DBスキーマの Single Source of Truth。
新しい Supabase プロジェクト（別環境）を作ってこのアプリを動かすときは、
本ファイルの手順で「migration の適用」と「migration だけではカバーできない
手動セットアップ」の両方を行うこと。

データモデル自体の仕様は `docs/specs/database.md` を参照。ここは**手順（runbook）**。

## 1. 前提

- [Supabase CLI](https://supabase.com/docs/guides/cli) をインストール済み
- 対象の Supabase プロジェクトが作成済み（[supabase.com](https://supabase.com) でリージョン等を選んで作成）
- Postgres major version は `supabase/config.toml` の `[db] major_version` と揃える

## 2. migration を適用する

```bash
supabase login
supabase link --project-ref <project-ref>
bun run db:push     # = supabase db push
```

**適用後は必ず検証する。** `db push` を実行した/しないに関わらず、以下の
2つを両方確認するまで完了とみなさない（片方だけでは drift を見逃す）。

```bash
bun run db:status   # = supabase migration list
                     # ローカルにあってリモートに無い version が無いこと

bun run gen:types    # リモートDBの実スキーマから型を再生成
git diff src/types/supabase.ts
                     # 差分が出たら「型はコミット済みだが実DBに未適用の
                     # カラム/テーブルがある」= migration 未適用
```

`db:status` は migration の**履歴テーブル**（`supabase_migrations.schema_migrations`）
を見るだけなので、version 番号さえ記録されていれば「適用済み」と表示される。
実際のスキーマと本当に一致しているかは `gen:types` の diff でしか確認できない。

> **2026-09 のインシデント**: `supabase/migrations/` に9件のmigrationファイルが
> 約1ヶ月コミットされていたが、一度もリモートDBへ適用されていなかった
> （`sort_order` 列、`waste_streaks` テーブルなど）。`Supabase Type Check` CI
> ([.github/workflows/db-types.yml](../../.github/workflows/db-types.yml)) は
> 型の diff だけを見るため、このCI自体は正しく落ち続けていたが、誰も
> `db:push` / `db:status` を実行して原因を追わなかったために放置された。
> **migration ファイルを追加した PR をマージしたら、その場で対象環境に
> `db:push` して `db:status` / `gen:types` diff で確認する**——ファイルを
> git に置いただけでは何も適用されない。

MCP (`mcp__Supabase__apply_migration` など) 経由で1件ずつ適用した場合、
migration の version はツール実行時刻で自動採番され、ローカルのファイル名
（タイムスタンプ）とズレる。放置すると `supabase db push` が「未適用」と
誤認して再実行し、`drop constraint` など非冪等な文で失敗し得るので、
`supabase_migrations.schema_migrations.version` をファイル名の日時に
揃えておくこと（可能な限り CLI の `db push` を使い、MCP 経由の適用は
CLI が使えない環境に限定するのが望ましい）。

## 3. migration だけでは終わらない手動セットアップ

以下は `supabase/migrations/` に**書けない**、または意図的に手動運用にして
いる項目。新環境では抜けなく実施すること。

### Storage バケット

- `item-images`（[20260430000006_item_images_bucket.sql](./20260430000006_item_images_bucket.sql)）
- `location-photos`（[20260724010001_location_photos_bucket.sql](./20260724010001_location_photos_bucket.sql)）

migration は RLS ポリシーのみを作成する。バケット自体は
Dashboard → Storage → New bucket（**Public bucket はオフ**）で作成すること。
バケットが無いままだとポリシーだけが存在する状態になり、アップロードは
`bucket not found` で失敗する。

### Vault secrets（pg_cron ジョブが参照）

以下の cron ジョブが `vault.decrypted_secrets` から読む前提:

- `project_url`
- `service_role_key`
- `cron_secret`

参照元: [20260628000003_schedule_expiry_notifications.sql](./20260628000003_schedule_expiry_notifications.sql)、
[20260905000003_schedule_waste_digest.sql](./20260905000003_schedule_waste_digest.sql)。

Dashboard → Project Settings → Vault で上記3つのキー名で登録する
（`cron_secret` の値は Edge Function 側の `CRON_SECRET` シークレットと
同じ値にする）。未設定でも migration 自体は成功するが、cron 実行時に
`net.http_post` が失敗し、期限通知・食品ロスダイジェストが送信されない。

### 拡張機能（Extensions）

`pg_cron` / `pg_net` は migration 内の
`create extension if not exists` で自動有効化される
（[20260628000003_schedule_expiry_notifications.sql](./20260628000003_schedule_expiry_notifications.sql)）。
cron ジョブが発火しない場合のみ、Database → Extensions で有効状態を確認する。

### Edge Functions

`supabase/functions/` 配下を全てデプロイする:

```bash
for fn in barcode-lookup image-proxy inventory-chat receipt-scan recipe-suggest \
          send-expiry-notifications send-test-notification send-waste-digest \
          shelf-scan subscribe-push verify-security-answer widget-data \
          get-security-question alexa-skill; do
  supabase functions deploy "$fn"
done
```

各関数のシークレットは `.env.example` の「Supabase Edge Function secrets」節を
参照し、`supabase secrets set KEY=VALUE` で設定する
（`CRON_SECRET` / `VAPID_*` / `RESEND_*` / `GEMINI_API_KEY` など、使う機能に応じて）。

### Auth 設定（migration 対象外）

- Leaked password protection（HaveIBeenPwned 連携）を Dashboard →
  Authentication → Policies で有効化する。DBの `enforce_mfa_aal`
  （[20260720092622_enforce_mfa_aal.sql](./20260720092622_enforce_mfa_aal.sql)）は
  MFA 検証済みユーザーに aal2 を要求するだけで、この設定とは独立。

## 4. TypeScript 型の生成とコミット

```bash
bun run gen:types
git diff src/types/supabase.ts   # 差分が無いことを確認してからコミット
```

## 5. CI（Supabase Type Check）を有効化する

`.github/workflows/db-types.yml` は以下が無いと自動的にスキップされる
（新環境を追加しても気づかれずに CI が無効なままになりがちなので、
リポジトリの Settings で明示的に設定する）:

- Repository **secret** `SUPABASE_ACCESS_TOKEN`
- Repository **variable** `SUPABASE_PROJECT_ID`

## 6. クライアント環境変数

```bash
cp .env.example .env.local
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_VAPID_PUBLIC_KEY`
を対象プロジェクトの値で埋める。詳細は README.md の「Getting Started」を参照。
