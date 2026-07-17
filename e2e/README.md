# E2E tests

Playwright specs in this directory run against `vite --mode test` (see
`playwright.config.ts` / `.env.test`) with `.github/workflows/e2e.yml` gating
execution behind the `e2e` PR label (or manual dispatch) to control CI cost.

## Backend strategy: network-level Supabase mock, not a real project

`auth.spec.ts` was, until #516/#518, backend-free — it only exercised the
login screen's client-side rendering and routing. Adding coverage for the
authenticated flow (add item -> consume -> shopping list, #516) and offline
behavior (#518) requires _some_ backend, since the app talks to Supabase for
everything past the login screen.

Standing up a real seeded local Supabase stack (`supabase start` + migrations

- seed data) in CI was the alternative suggested in #516. We didn't do that
  for this round, mainly because of CI cost/flakiness (a Postgres + GoTrue +
  PostgREST + Realtime stack booting on every gated E2E run) relative to what
  these specs need to prove: that the client-side flow, form wiring, and offline
  guard logic work end-to-end. Instead, `e2e/fixtures/supabaseMock.ts` installs
  Playwright request interception for `**/auth/v1/**` and `**/rest/v1/**` and
  serves a small in-memory PostgREST-like store (supports `eq`/`is`/`ilike`/`or`
  filters, `order`, `limit`, insert/update/delete/upsert, and
  `Prefer: count=exact` HEAD requests — the subset of query syntax the app's
  hooks actually generate).

### What this does and doesn't cover

- Covers: routing, form validation and submission, TanStack Query
  cache/invalidation behavior, the `requireOnline()` offline-mutation guard,
  and the overall add -> consume -> shopping-list user journey.
- Does **not** cover: real PostgREST semantics (RLS, constraint violations,
  actual `CREATE TABLE` shapes drifting from the app's assumptions — that's
  what `db-types.yml` and the spec-drift check are for), or the actual Service
  Worker cache (`src/sw.ts`'s workbox `NetworkFirst` strategy) — `pwa-offline.spec.ts`
  asserts the _application-level_ contract (cached query data stays visible,
  mutations are blocked, recovery works) by flipping `navigator.onLine` via
  `context.setOffline()`, not by exercising the installed Service Worker's
  cache directly. A true SW-level regression test would need Playwright to run
  against a built+served `dist/` (so the SW registers) and control cache
  population explicitly; worth a follow-up if a real cache-strategy bug shows
  up that this level of test wouldn't catch.

If/when a seeded local Supabase stack becomes cheap enough for gated PRs (e.g.
a prebuilt container image), swapping the fixture for the real thing should be
a drop-in replacement — `installSupabaseMock`/`loginAsFakeUser` are the only
things specs depend on.
