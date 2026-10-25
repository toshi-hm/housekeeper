-- #1247: security definer RPCs bypass RLS, so the restrictive mfa_aal_required
-- policy (#1209) does not apply to them. A password-only (aal1) session of an
-- MFA-enrolled user could still mutate household data through these RPCs.
-- Prepend the same private.mfa_access_allowed() guard to the body of every
-- state-changing security definer RPC. The current definitions are patched in
-- place (pg_get_functiondef) so this migration does not copy their bodies.

do $$
declare
  v_signature text;
  v_oid oid;
  v_def text;
  v_patched text;
  v_guard constant text :=
    E'begin\n  if not (select private.mfa_access_allowed()) then\n'
    || E'    raise exception ''mfa verification required'' using errcode = ''42501'';\n'
    || E'  end if;\n';
begin
  foreach v_signature in array array[
    'public.create_household(text)',
    'public.redeem_household_invite(text, boolean)',
    'public.rename_household(text)',
    'public.remove_household_member(uuid)',
    'public.set_household_member_display_name(text)',
    'public.archive_purchased_shopping_items()'
  ]
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'function % not found', v_signature;
    end if;

    v_def := pg_get_functiondef(v_oid);
    if v_def like '%mfa_access_allowed%' then
      continue;
    end if;

    -- First line consisting only of BEGIN is the plpgsql body start.
    -- 本番では CRLF で保存された関数本体があるため、CR も許容する。
    v_patched := regexp_replace(v_def, E'\\nbegin[ \\t\\r]*\\r?\\n', E'\n' || v_guard, 'i');
    if v_patched = v_def then
      raise exception 'could not patch %', v_signature;
    end if;

    execute v_patched;
  end loop;
end;
$$;
