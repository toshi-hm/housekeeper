-- `revoke ... from public` does not remove the EXECUTE grant that Supabase's
-- default privileges give to `anon` directly. redeem_household_invite is a
-- SECURITY DEFINER function that only makes sense for a signed-in user, so
-- strip the anon grant explicitly. Idempotent: safe if already revoked.
revoke execute on function public.redeem_household_invite(text, boolean) from anon;
