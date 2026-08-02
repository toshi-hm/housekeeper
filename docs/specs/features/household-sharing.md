# 多人数共有（Household Sharing）

## 1. 目的 / 背景

housekeeper は当初「単一ユーザー・セルフホスト」を前提に設計されている
（`CLAUDE.md` / `docs/specs/features/auth.md`）。全テーブルの RLS は
`auth.uid() = user_id` の単一所有者モデルで、家族など同居する別アカウントの
ユーザーは在庫を共有できない（元issue: #64）。

本 spec は、この制約を変更し、**世帯（household）単位で在庫データを共有できる**
ようにするための設計をまとめる。**この変更はプロダクトの根本方針の変更であり、
実装は複数 PR に分割する前提**（工数目安 L、1週間〜）。

> **決定事項（2026-07-31）**: 「Single user」制約を変更し、世帯共有を実装する方針を
> 承認済み（PLANS.md §9 決定ログ参照）。ただし本 spec は設計段階であり、実装は
> 別途 Issue 化して段階的に進める。

## 2. スコープ判断

### やること

- 世帯（`households`）とそのメンバー（`household_members`）の管理
- 在庫関連の主要テーブルを「世帯単位の共有データ」に切り替える（3.2 参照）
- 招待コードによるメンバー追加（メール送信基盤を新設しない、シンプルな方式）
- オーナー/メンバーの単純な2ロール（3.4 参照）
- 既存ユーザーの後方互換移行（個人世帯の自動作成 + 既存データの `household_id` バックフィル）
- Alexa スキルのマルチユーザー対応（#159, 8章）— household モデルの上に Account Linking を追加

### やらないこと（明示的にスコープ外）

- **アイテム単位/行単位のアクセス制御（ACL）**: 「このアイテムだけ夫婦に見せない」といった
  粒度の権限は持たない。世帯に参加した時点で世帯の在庫データ全体が見える/編集できる
  （家庭内在庫管理という利用シーン上、行レベルのプライバシー分離は過剰と判断）
- **複数世帯への同時所属**: 1 ユーザーは常に 1 世帯にのみ所属する（v1 の単純化。
  「実家の在庫と自宅の在庫を1アカウントで両方見る」等はスコープ外）
- **世帯の削除・オーナー譲渡の複雑なフロー**: 初期実装ではオーナーは固定
  （オーナー脱退時の扱いは4章で最小限のガードのみ用意する）
- **メール招待の自動送信**: 招待は「コードを生成し、招待者が別チャネル（口頭/メッセージアプリ等）
  で共有する」方式に留め、Resend 等のメール送信は使わない（実装コストを抑えるため）
- **既存 v1 の「単一ユーザー」ドキュメント表現をすべて即座に書き換えること**: 実装が
  完了するまでは `docs/specs/features/auth.md` 等に「移行中」の注記を残す

## 3. データモデル

### 3.1 新規テーブル

```sql
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type household_role as enum ('owner', 'member');

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- 1ユーザー1世帯の制約（v1のやらないこと参照）
create unique index household_members_user_unique on household_members(user_id);

create table household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  code text not null unique, -- 短い英数字コード（例: 8桁）。招待者が口頭/メッセージで共有する
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null, -- 発行から一定時間（例: 24h）で失効
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
```

- RLS: `households` / `household_members` / `household_invites` は「自分が所属する
  household に関するものだけ見える」ポリシーにする（`household_members` に自分の行が
  あるかで判定）。招待コードの検証（`redeem`）だけは未所属ユーザーも呼べる必要があるため、
  `save_shopping_list_template` と同様に `security invoker` の Postgres 関数
  `redeem_household_invite(p_code text)` 経由で行う（コード一致 + 未失効 + 未使用の検証、
  `household_members` への insert をアトミックに行う）。

### 3.2 既存テーブルへの `household_id` 追加

「世帯で共有すべきデータ」と「個人設定として残すデータ」を分ける。

| 分類                      | テーブル                                                                                                                                                                                                                                                   | 変更                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共有（household_id 追加） | `items`, `item_lots`, `categories`, `storage_locations`, `custom_units`, `consumption_logs`, `shopping_list_items`, `shopping_list_archive`, `shopping_list_templates`, `shopping_list_template_items`, `recipes`, `recipe_items`, `tags`, `items_to_tags` | `household_id uuid not null references households(id) on delete cascade` を追加。`user_id` 列自体は「作成者」の記録として残す（監査用途、削除はしない） |
| 個人のまま（変更なし）    | `user_settings`, `notification_preferences`, `push_subscriptions`, `user_security_questions`, `chat_rate_limits`                                                                                                                                           | 言語/通知/認証はデバイス・個人単位の設定のため household化しない                                                                                        |

RLS ポリシーは共有テーブル全てで以下の形に統一する（`save_shopping_list_template` 等
既存の RPC パターンと同様、`private.` schema にヘルパー関数を置く）:

```sql
create or replace function private.current_household_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

-- 例: items
drop policy "Users can only access their own items" on items;
create policy "Household members can access their household's items"
  on items for all
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));
```

### 3.3 Storage バケット（`item-images` / `location-photos`）

現在のオブジェクトパスは `<user_id>/<item_id>.<ext>` で、RLS は
`(storage.foldername(name))[1] = auth.uid()::text` により所有者本人のみアクセス可能。
世帯共有では他メンバーも同じ画像を見られる必要があるため、**パスを
`<household_id>/<item_id>.<ext>` に変更**し、RLS を
`(storage.foldername(name))[1]::uuid = private.current_household_id()` に変更する。

- 既存オブジェクトの移行（`user_id` パス → `household_id` パス）が必要。個人世帯
  移行時（4章）に合わせてオブジェクトを `copy` + 旧パス `remove` するバッチ処理を
  Edge Function または一度限りの管理スクリプトとして用意する。

### 3.4 ロール / 権限

最小限の2ロールに留める（4.1 やらないことの通り、細かい権限体系は持たない）。

| 操作                            | owner | member |
| ------------------------------- | :---: | :----: |
| 在庫データの閲覧/追加/編集/削除 |  ✅   |   ✅   |
| 招待コードの発行                |  ✅   |   ✅   |
| メンバーの削除（強制退会）      |  ✅   |   ❌   |
| 世帯名の変更                    |  ✅   |   ❌   |
| 世帯の削除                      |  ✅   |   ❌   |

## 4. 既存ユーザーの移行（後方互換）

サインアップ済みの既存ユーザーは `households` に所属していない状態で本機能がデプロイ
されるため、以下の移行を1回限りのマイグレーション（データマイグレーション、DDLとは別）
として実行する。

1. 既存の各 `auth.users` 行について、`households`（`name` はユーザーのメール等から
   仮生成、後で変更可能）を1件作成し、`household_members` にその本人を `role='owner'`
   で追加する（**1ユーザー = 1個人世帯**）
2. 上記で作成した household_id を、そのユーザーが `user_id` として所有する
   共有テーブルの全行に `update ... set household_id = ...` でバックフィルする
3. Storage オブジェクトを `<user_id>/...` → `<household_id>/...` へコピーし、
   `items.image_path` / `storage_locations.photo_path` を新パスに更新後、旧オブジェクトを削除
4. 移行完了後、共有テーブルの `household_id` 列を `not null` 制約に変更する
   （移行前は一時的に nullable にしておき、バックフィル漏れを検知しやすくする）

新規サインアップ時は、`user_settings` 作成と同じタイミング（DBトリガまたは初回アクセス
時 upsert、`docs/specs/features/auth.md` 参照）で個人世帯を自動作成する。

## 5. 招待フロー（画面）

| ルート                               | 内容                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/_auth/settings/household`          | 世帯管理: メンバー一覧、招待コード発行（owner/member とも可）、退会/削除（owner のみ）                       |
| 招待コード入力（同ルート内モーダル） | 別ユーザーがコードを入力 → `redeem_household_invite` RPC 呼び出し → 自分の個人世帯を離れ、招待元の世帯に加入 |

- コード入力して他世帯に参加する場合、**自分の個人世帯にあった既存データはどうなるか**の
  UX 決定が必要（例: 「あなたの既存の在庫データは個人世帯に残ります。新しい世帯には
  引き継がれません」という警告を表示し、参加前に確認させる。データの自動マージは複雑さと
  誤操作リスクが高いため行わない）。

## 6. API（hook、実装時の想定）

| hook                         | 機能                                                   |
| ---------------------------- | ------------------------------------------------------ |
| `useHousehold()`             | 自分の所属する household + メンバー一覧を取得          |
| `useCreateHouseholdInvite()` | 招待コード発行（`household_invites` insert）           |
| `useRedeemHouseholdInvite()` | コード入力による参加（`redeem_household_invite` RPC）  |
| `useRemoveHouseholdMember()` | メンバー強制退会（owner のみ、RLS + アプリ側チェック） |
| `useRenameHousehold()`       | 世帯名変更（owner のみ）                               |

既存の `useItems` 等のデータ取得 hook 自体は変更不要（RLS が household 単位に
差し替わるため、クエリ条件はそのまま `.eq("household_id", ...)` を明示するか、
RLS だけに委ねて無条件 select にするかは実装時に決定する。後者の方が
既存コードへの変更が少ない）。

## 7. エラー / 競合ケース

- 招待コードが期限切れ/使用済み: 専用のエラーメッセージ（「このコードは無効です」）
- 既に他の世帯に所属しているユーザーがコードを入力: 「まず現在の世帯を離れてください」で
  ブロック（1ユーザー1世帯の制約、2.やらないこと参照）
- owner が最後の1人の状態で退会しようとした場合: ブロックし、事前に他メンバーへの
  オーナー譲渡または世帯削除を促す（譲渡UIの詳細は実装時に決定）
- 招待コードの連続誤入力（総当たり対策、#734）: `redeem_household_invite(p_code text)` は
  `returns table (household_id uuid, error_code text)` で、失敗時も例外を投げず
  `error_code` に `'HK005'`（既に世帯に所属）/ `'HK006'`（無効・期限切れ）/
  `'HK007'`（試行回数過多）のいずれかを返す。呼び出し内で
  `check_household_invite_rate_limit()`（ユーザー単位、15分窓で5回、超過後は
  指数バックオフでロックアウト）を必ず経由し、コードの正誤に関わらず全呼び出しを
  カウントする。例外を投げる実装だと「同一トランザクション内で後から例外を投げると
  それより前の書き込み（レート制限のカウンタ更新）もロールバックされる」という
  Postgres の制約により、無効コードの連投がカウントされずレート制限が実質無効化
  されるため、あえて返り値ベースの契約にしている。

## 8. Alexa マルチユーザー対応（#159）

household モデル導入後、Alexa 側の変更は #159 に記載の技術方針をそのまま採用できる
（household 固有の追加実装は不要 — RLS が household 単位になっているため、
JWTベースの認証さえ通せば自動的にスコープされる）。

- Alexa Developer Console で Account Linking を設定（Authorization URL /
  Token URL に Supabase Auth の OAuth エンドポイントを使用）
- Edge Function 側は `SUPABASE_SERVICE_ROLE_KEY` + 環境変数 `USER_ID` 固定を廃止し、
  Alexa が渡す `accessToken` から user-scoped Supabase client（anon key + JWT）を生成
- 未リンク時は `LinkAccount` カードを返す `buildLinkAccountResponse()` を追加
- 環境変数: `SUPABASE_SERVICE_ROLE_KEY` / `USER_ID` を削除、`SUPABASE_ANON_KEY` を追加
- **依存関係**: 本機能（household の RLS 切り替え）が先行実装されている必要がある
  （#64 のマイグレーションが完了していないと、Alexa 側だけ Account Linking しても
  既存の service-role 前提のクエリが壊れる）

## 9. テスト / CI

- DB: `supabase/tests/database/` に `rls_household.test.sql`（pgTAP）を新規追加し、
  以下を検証する: 世帯メンバーは自世帯のデータのみ見える/書ける、他世帯のデータには
  一切アクセスできない、`redeem_household_invite` の原子性（二重利用不可）
- 既存の `rls_items.test.sql` 等は household ベースの RLS に合わせて更新が必要
- フロント: 招待発行 → コード入力 → 参加 → 共有データが見える、のハッピーパスを
  `bun test` + 可能であれば e2e（`e2e/fixtures/supabaseMock.ts` の拡張が必要）
- 移行スクリプト（4章）は本番適用前に必ずステージング相当のデータでリハーサルする

## 10. 完了条件

- 既存ユーザーが個人世帯へ自動移行され、既存機能に regression がない
- 世帯管理画面から招待コード発行 → 別ユーザーが参加 → 双方から同じ在庫データが
  見え、追加/編集/削除が反映される
- Storage 画像が新メンバーからも閲覧できる
- PR の CI（quality / test / knip / commitlint / lighthouse / deno-test 等）がすべて緑
