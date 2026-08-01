-- #714: Distinguish "賞味期限" (best-before, quality-only) from "消費期限"
-- (use-by, safety-critical) so alerts can reflect the actual urgency instead
-- of treating every expiry date the same (alert fatigue).
--
-- Nullable, defaults to null so existing rows keep today's undifferentiated
-- behavior (getExpiryStatus / notifications treat null the same as before).
alter table public.items
  add column if not exists expiry_type text
    check (expiry_type is null or expiry_type in ('best_before', 'use_by'));
