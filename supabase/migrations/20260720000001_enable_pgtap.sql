-- Enable pgTAP so `supabase test db` can run the RLS regression tests under
-- supabase/tests/database/. pgTAP ships with the Supabase Postgres image but
-- is not enabled by default.
create extension if not exists pgtap;
