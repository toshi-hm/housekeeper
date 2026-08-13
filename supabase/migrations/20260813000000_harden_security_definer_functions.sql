-- SECURITY DEFINER 関数の締め: 意図しない EXECUTE を剥がし、search_path を固定する。
--
-- Supabase の security advisor が指摘していた2件への対応:
--   - anon_security_definer_function_executable / authenticated_..._executable
--   - function_search_path_mutable
--
-- 背景: 各マイグレーションは `revoke all on function ... from public` +
-- 必要なロールへの `grant execute` を書いていたにもかかわらず、実際には
-- anon / authenticated にも EXECUTE が付いていた（`has_function_privilege`
-- で確認済み）。Supabase が postgres ロールに設定している default privileges
-- により、public に作られた関数が Data API ロールへ自動公開されるため。
-- public は PostgREST の公開スキーマ（supabase/config.toml の
-- `schemas = ["public", "graphql_public"]`）なので、これらは
-- `/rest/v1/rpc/<関数名>` として外部から到達できる状態だった。

-- ## 1. search_path を固定する
--
-- search_path が未設定だと、呼び出し側の search_path 次第で名前解決が変わりうる
-- （特に SECURITY DEFINER の handle_new_user は、先頭に別スキーマを差し込まれると
-- 意図しないオブジェクトを掴まされる余地がある）。
--
-- `alter function ... set search_path = ''` だけでも現時点の状態は直せるが、
-- **`create or replace function` は SET 句を明示しないと既存の設定を消す**ため、
-- 将来だれかがこれらの関数を再定義した時点で黙って元に戻ってしまう。
-- set_updated_at は実際に 20260429000001 と 20260430000003 の2回定義されており、
-- 再定義は起こりうる。そこで ALTER ではなく、SET 句を含んだ定義そのものを
-- 最新版として置き直す（以後これらを再定義する場合も SET 句を残すこと）。
--
-- 本体のロジックは既存定義と完全に同じで、SET 句を足しただけ:
--   - handle_new_user は既に public.user_settings とスキーマ修飾済み
--   - 他の4つは now() / tg_op しか使っておらず、pg_catalog は常に暗黙で検索される
--
-- なお `create or replace` は既存関数の ACL を保持し、default privileges は
-- 新規作成時にしか適用されないため、この再定義で権限が付き直すことはない。
-- 念のため、下の revoke より先に実行している。

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.items_set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_item_lot_opened_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.opened_at is null and new.opened_remaining is not null then
      new.opened_at = now();
    end if;
    return new;
  end if;

  if new.opened_at is not distinct from old.opened_at then
    if new.opened_remaining is not null and old.opened_remaining is null then
      new.opened_at = now();
    elsif new.opened_remaining is null and old.opened_remaining is not null then
      new.opened_at = null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ## 2. anon からの EXECUTE を剥がす
--
-- 実害は限定的で、#846 の pgTAP のような任意SQL実行はできない
-- （auth.uid() が null になるため create_household は NOT NULL 違反、
-- check_*_rate_limit / redeem_household_invite はフェイルクローズする）。
-- とはいえ各マイグレーションの意図と食い違う不要な露出なので明示的に閉じる。
--
-- 呼び出し元は確認済みで、いずれも anon では呼んでいない:
--   - check_chat / recipe / barcode_rate_limit: 各 Edge Function が
--     Authorization ヘッダ必須 + auth.getUser() 検証のうえ、JWT を付けた
--     user-scoped クライアント（= authenticated）で呼ぶ
--   - create_household / redeem_household_invite: ログイン済みユーザー向けの
--     クライアント RPC（household UI は未実装）
revoke execute on function public.check_barcode_rate_limit() from anon;
revoke execute on function public.check_chat_rate_limit() from anon;
revoke execute on function public.check_recipe_rate_limit() from anon;
revoke execute on function public.check_household_invite_rate_limit() from anon;
revoke execute on function public.create_household(text) from anon;
revoke execute on function public.redeem_household_invite(text) from anon;

-- ## 3. check_security_reset_rate_limit は authenticated からも剥がす
--
-- この関数は 20260716000001 で **service_role にしか grant していない**が、
-- 実際には authenticated にも EXECUTE が付いていた（上記の自動公開のため）。
-- 他のレート制限関数と違い閾値が**呼び出し側パラメータ**になっており、
-- 対象も auth.uid() ではなく client 指定の (p_scope, p_identifier) なので、
-- 露出したままだと任意のログインユーザーが次のように他人を締め出せる:
--
--   select * from check_security_reset_rate_limit(
--     'verify-security-answer', '<被害者のメール>', 0, 15, 525600, 525600);
--
-- attempt_count + 1 > 0 が即成立して locked_until = now() + 1年 が書かれ、
-- 以後その識別子のパスワードリセットは正規の呼び出しでも常に
-- allowed=false になる（アカウント復旧の恒久的な妨害）。加えて、任意の
-- メールアドレスについてリセット試行の有無を探ることもできてしまう。
--
-- 呼び出し元は Edge Function の get-security-question / verify-security-answer
-- のみで、どちらも SUPABASE_SERVICE_ROLE_KEY を使う（= service_role）ため、
-- authenticated を剥がしても未ログインのリセット導線には影響しない。
-- なお、あとから追加された check_chat / recipe / barcode / household_invite の
-- 各関数が閾値を定数で持っているのは、まさにこの「直接呼ばれても悪用されない」
-- ための設計（各マイグレーションのコメント参照）。
revoke execute on function public.check_security_reset_rate_limit(
  text, text, integer, integer, numeric, numeric
) from anon, authenticated;

-- ## 4. handle_new_user はトリガ専用なので誰からも呼べないようにする
--
-- auth.users の AFTER INSERT トリガからのみ使われる。トリガ関数の EXECUTE 権限は
-- **発火時には検査されない**（CREATE TRIGGER 時のみ）ので、剥がしてもサインアップは
-- 壊れない。
--
-- この関数だけは `revoke ... from anon, authenticated` では剥がれない点に注意:
-- 他の関数は各マイグレーションで `revoke all on function ... from public` 済み
-- なので直接 GRANT だけが残っていたが、handle_new_user にはその revoke が無く、
-- CREATE FUNCTION 時に **PUBLIC 疑似ロール**へ付与される既定の EXECUTE が
-- そのまま残っている。PUBLIC を剥がさない限り
-- has_function_privilege('anon', ...) は true のままになる。
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
