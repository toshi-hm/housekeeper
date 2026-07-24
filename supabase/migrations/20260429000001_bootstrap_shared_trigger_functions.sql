-- Bootstrap shared trigger functions ahead of their original definitions so a
-- full migration replay from an empty database succeeds in order:
-- - public.set_updated_at() is used by 20260430000001/000002_*.sql but was not
--   defined until 20260430000003_extend_items.sql.
-- - public.update_updated_at_column() is used by
--   20260430000007_create_shopping_list_items.sql but was never defined by any
--   migration.
-- Both later files use `create or replace function`, so their own
-- (re-)definitions remain idempotent no-ops once these exist.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
