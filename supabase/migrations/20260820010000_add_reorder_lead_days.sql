-- Extend automatic reorder (#353) with a pace-based trigger (#853).
--
-- `reorder_threshold` alone can't distinguish a slow-moving item from a
-- fast-moving one: a fixed unit-count threshold misses items that still
-- have "enough" units on hand but, at the current consumption pace, will
-- run out soon. `reorder_lead_days` lets an item opt in to also triggering
-- the auto-add-to-shopping-list flow when `computeConsumptionPaceForecast`'s
-- predicted remaining days drops to or below this value.
--
-- NULL (default) = opt-out: only the existing `reorder_threshold` check
-- applies, preserving current behavior for all existing items.
alter table public.items
  add column if not exists reorder_lead_days integer
    check (reorder_lead_days is null or reorder_lead_days >= 0);
