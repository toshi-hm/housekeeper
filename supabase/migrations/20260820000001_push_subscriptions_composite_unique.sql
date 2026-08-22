-- push_subscriptions.endpoint: uniqueness must be per-user, not global (#826)
--
-- `endpoint` was declared globally `unique`. When the same physical
-- device/browser (and thus the same Service Worker registration) is shared
-- by multiple users -- e.g. a household using one shared tablet or PC -- the
-- browser's `registration.pushManager.subscribe()` returns the identical
-- `endpoint` for every user who subscribes on that device (with the same
-- `applicationServerKey`). The second user's subscribe call then either
-- violates the global unique constraint outright, or -- because RLS hides
-- rows owned by other users -- the upsert can't see the first user's
-- existing row to update it, and fails.
--
-- Replace the global uniqueness with a composite (user_id, endpoint) unique
-- constraint: the same endpoint may now be held by different users (one row
-- each), while a single user still cannot have duplicate rows for the same
-- endpoint.
alter table push_subscriptions drop constraint push_subscriptions_endpoint_key;
alter table push_subscriptions
  add constraint push_subscriptions_user_id_endpoint_key unique (user_id, endpoint);
