# E2E tests

Playwright specs in this directory run against `vite --mode test` (see
`playwright.config.ts` / `.env.test`), with `.github/workflows/e2e.yml`
running on every PR and on push to `main` (#664 — previously gated behind an
`e2e` PR label that was easy to forget, so E2E almost never ran in CI and
several specs silently rotted; see #658 for what that surfaced).

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
  - `pwa-sw-navigation.spec.ts` (#784) is that follow-up, but only for the
    Workbox `NavigationRoute` app-shell fallback: it builds+serves a real
    `dist/` with `vite preview` (so the Service Worker actually registers and
    controls navigations) and asserts that a direct, offline navigation to a
    URL with no precache entry of its own still loads the app shell. The rest
    of this directory's specs — including `pwa-offline.spec.ts` — still run
    against the dev server and don't exercise the installed Service Worker.

If/when a seeded local Supabase stack becomes cheap enough for gated PRs (e.g.
a prebuilt container image), swapping the fixture for the real thing should be
a drop-in replacement — `installSupabaseMock`/`loginAsFakeUser` are the only
things specs depend on.

## Specs in this directory

- `auth.spec.ts` — unauthenticated login screen smoke tests.
- `main-flow.spec.ts` — add item -> consume -> shopping list (#516).
- `pwa-offline.spec.ts` — offline mutation guard + cached data visibility (#518).
- `pwa-sw-navigation.spec.ts` — real Service Worker navigation fallback for
  offline direct navigation to a non-precached route (#784).
- `calendar.spec.ts` — expiry calendar check-off + undo (#658).
- `recipes.spec.ts` — recipe creation and execution (consumption recording, #658).
- `bulk-actions.spec.ts` — dashboard multi-select bulk move/consume/delete (#658).

## Projects: `chromium` (desktop) and `mobile-chromium` (#753)

`playwright.config.ts` defines two projects. `chromium` (`devices["Desktop
Chrome"]`) runs every spec above. `mobile-chromium` (`devices["Pixel 7"]`,
touch input) additionally runs just `main-flow.spec.ts` and
`pwa-offline.spec.ts` — scoped to those two rather than the full suite to
avoid doubling CI runtime, per #753's proposal. This app is mobile-first
(CLAUDE.md / PLANS.md), and the sticky bottom nav / mobile header only render
below the `lg` breakpoint, so `chromium`'s desktop viewport never lays them
out at all — `mobile-chromium` is the only project that can catch a real
bottom-nav/header reachability regression.

### Touch hit-test quirk (`e2e/fixtures/mobileClick.ts`, #753)

On `mobile-chromium` only, Playwright's actionability "receives pointer
events" check (and the `boundingBox()` it relies on) can be unreliable near
sticky elements — it can report a target as covered by the sticky nav/header
even when it demonstrably isn't (verified via a live, in-page
`getBoundingClientRect()` + `document.elementFromPoint()`, and via a real
`{ force: true }` click that lands correctly and completes the app's
mutation). `clickBypassingTouchHitTestQuirk(locator, testInfo)` reimplements
the reachability check that way instead of trusting Playwright's probe, and
only then force-clicks — so a _genuine_ occlusion regression still fails the
check (and the test), while the known false positive doesn't. Use it for any
new `mobile-chromium`-covered click that ends up needing it; see the
docstring in that file for the full investigation.

## Mock fixture gotchas (learned the hard way, #658)

Fixing #664 above made every spec in this directory actually run in CI for the
first time in a long while, which surfaced several latent bugs in the mock
fixture and in the specs themselves — none of them app bugs. Worth knowing if
you add a new spec:

- **The access token must be a structurally-valid JWT.** `@supabase/auth-js`'s
  `decodeJWT` requires exactly 3 base64url segments and throws
  `AuthInvalidJwtError: Invalid JWT structure` on a plain opaque string.
  `createFakeAccessToken()` builds an unsigned-but-well-formed token; reuse it
  rather than hand-rolling another fake token.
- **Routes with a `validateSearch` schema serialize their (even default-valued)
  search params into the URL.** A `waitForURL(/\/some-route$/)` regex will
  never match `/some-route?tab=info`. Match an optional trailing query string
  instead (`/\/some-route(\?.*)?$/`), or rely on `[^/]+$`-style patterns that
  happen to swallow query strings too.
- **The mock has no schema/constraint awareness**, so a column the real
  Postgres schema defaults (e.g. `shopping_list_items.status default
'planned'`) comes back `undefined` on a row inserted without that column
  explicitly set, silently breaking any later `.eq(...)` filter that assumes
  it. Add missing defaults to `ROW_DEFAULTS` in `fixtures/supabaseMock.ts`
  rather than changing the app to always pass the column explicitly.
- **`ItemCard`'s whole-card click target is an absolutely-positioned
  `<Link aria-label={item.name}>` overlay, not the visible text.** Target it
  with `page.getByRole("link", { name: itemName })`; clicking the text node
  directly makes Playwright's actionability check spin until timeout even
  though a real click at that point does land on (and navigate via) the
  overlay.
- **`supabase.rpc(...)` calls aren't handled generically.** The mock's
  `**/rest/v1/**` route treats any path as a table, so an unhandled
  `rest/v1/rpc/<fn>` POST silently "succeeds" (inserts into a bogus `rpc/<fn>`
  store entry) without applying the function's real effects. A spec that
  exercises a hook backed by a Postgres RPC (e.g. `bulk_consume_items`, #743)
  needs an explicit `table === "rpc/<fn>"` case added to
  `fixtures/supabaseMock.ts` that mirrors the migration's SQL against the
  in-memory store — see the `bulk_consume_items` case for the pattern.
