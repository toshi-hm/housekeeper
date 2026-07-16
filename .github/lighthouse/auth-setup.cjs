// Lighthouse CI puppeteerScript (#517): authenticates against a faked Supabase
// backend so `.lighthouserc.json` can measure authenticated main screens
// (dashboard, calendar, stats), not just the public /login page.
//
// Runs once per URL in `collect.url` (LHCI re-invokes puppeteerScript before
// each run). We skip it entirely for /login so that page keeps measuring the
// real unauthenticated experience.
//
// This mirrors e2e/fixtures/supabaseMock.ts (see that file, and
// e2e/README.md, for why a network-level fake instead of a real Supabase
// project) but is deliberately GET-only / read-mostly: Lighthouse measures
// page load performance & accessibility, it doesn't drive mutations.

const FAKE_USER_ID = "00000000-0000-4000-8000-000000000001";
const FAKE_USER_EMAIL = "lighthouse@example.test";

const nowIso = () => new Date().toISOString();

const buildSeedItems = () =>
  Array.from({ length: 24 }, (_, i) => ({
    id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
    user_id: FAKE_USER_ID,
    name: `Sample Item ${i + 1}`,
    barcode: null,
    category_id: null,
    storage_location_id: null,
    units: 1,
    content_amount: 1,
    content_unit: "pcs",
    opened_remaining: null,
    purchase_date: null,
    expiry_date:
      i % 3 === 0 ? new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10) : null,
    notes: null,
    image_path: null,
    minimum_stock: null,
    deleted_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

const TABLE_SEEDS = {
  items: buildSeedItems(),
  categories: [],
  storage_locations: [],
  user_settings: [
    {
      user_id: FAKE_USER_ID,
      language: "en",
      expiry_warning_days: 3,
      default_unit: "pcs",
      notify_at: "08:00:00",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
};

/** @param {import('puppeteer').Page} page */
module.exports = async (page, context) => {
  const targetUrl = new URL(context.url);
  if (targetUrl.pathname === "/login") return;

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();

    if (url.includes("/realtime/v1/")) {
      req.abort();
      return;
    }

    if (url.includes("/auth/v1/")) {
      const user = {
        id: FAKE_USER_ID,
        aud: "authenticated",
        role: "authenticated",
        email: FAKE_USER_EMAIL,
        app_metadata: {},
        user_metadata: {},
        created_at: nowIso(),
      };
      const session = {
        access_token: "lighthouse-fake-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "lighthouse-fake-refresh-token",
        user,
      };
      if (url.includes("/auth/v1/user")) {
        req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
        return;
      }
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
      return;
    }

    if (url.includes("/rest/v1/")) {
      const table = new URL(url).pathname.replace(/^.*\/rest\/v1\//, "");
      const rows = TABLE_SEEDS[table] ?? [];
      const accept = req.headers().accept ?? "";
      const wantsSingle = accept.includes("vnd.pgrst.object+json");
      const body = JSON.stringify(wantsSingle ? (rows[0] ?? null) : rows);
      req.respond({ status: 200, contentType: "application/json", body });
      return;
    }

    req.continue();
  });

  await page.goto(`${targetUrl.origin}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", FAKE_USER_EMAIL);
  await page.type("#password", "lighthouse-password-not-checked");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('form button[type="submit"]'),
  ]);
};
