-- pgTAP を public から extensions スキーマへ移動する。
--
-- 20260720000006_enable_pgtap.sql は `create extension if not exists pgtap;` を
-- スキーマ指定なしで実行しており、pgTAP が **public** に入っていた。public は
-- PostgREST の公開スキーマ（supabase/config.toml の
-- `schemas = ["public", "graphql_public"]`）なので、pgTAP が持ち込む
-- 1000個超の関数がすべて `/rest/v1/rpc/<関数名>` として外部から到達可能に
-- なっていた。拡張の関数は既定で PUBLIC に EXECUTE が付くため、`anon` /
-- `authenticated` のどちらからも実行できる状態だった。
--
-- 問題は、その中に **引数の文字列を SQL として実行する** 関数が含まれること:
--   lives_ok(text) / throws_ok(text) / performs_ok(text, numeric) / _query(text)
--   runtests() / do_tap() / findfuncs() / _db_privs()
-- いずれも security invoker なので権限昇格は起こらず RLS も効いたままだが、
-- 「任意SQLをサーバ側で実行できる口」「エラーメッセージ経由のスキーマ情報の
-- 漏洩」「重いクエリを回されることによる CPU 消費」「関数カタログ・権限構成の
-- 読み取り」といった、意図しない攻撃面が anon に開いていた。
-- anon キーはクライアントに埋め込まれる公開情報である点に注意。
--
-- pgTAP はテスト専用の依存（supabase/tests/database/*.test.sql を
-- `supabase test db` で実行するためだけに使う）であり、アプリの実行時経路からは
-- 一切呼ばれない。したがって公開スキーマに置く理由がない。
--
-- 移動先の extensions スキーマは PostgREST に公開されていない（config.toml の
-- `schemas` に含まれず、`extra_search_path` にあるだけ）ため、これで RPC
-- エンドポイントとしての露出が無くなる。pgcrypto / uuid-ossp /
-- pg_stat_statements も同様に extensions に置かれており、本変更でそれらと
-- 揃うことになる。
--
-- テストは壊れない: `supabase test db` が接続する postgres ロールの
-- search_path は `"$user", public, extensions` なので、テストSQL中の
-- 無修飾の `plan()` / `results_eq()` などはこれまで通り解決される。
--
-- 20260720000006 を直接書き換えず新しいマイグレーションとして追加しているのは、
-- 適用済みのマイグレーションを後から書き換えないため（既存環境では再実行
-- されないので書き換えても効果がなく、履歴と実体が食い違うだけになる）。
-- pgtap は relocatable = true なので set schema で移動できる。
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgtap' and n.nspname = 'public'
  ) then
    alter extension pgtap set schema extensions;
  end if;
end
$$;
