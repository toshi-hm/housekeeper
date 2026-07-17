import type { Page, Route } from "@playwright/test";

/**
 * Lightweight in-process fake of the parts of the Supabase HTTP API (Auth + PostgREST)
 * that the app's hooks touch, so E2E specs can drive the authenticated flow
 * (add item -> consume -> shopping list, #516) and offline behavior (#518)
 * without a real Supabase project.
 *
 * This is intentionally NOT a faithful PostgREST re-implementation — it only
 * supports the small subset of query syntax the app actually generates
 * (`eq.`, `is.`, `not.is.`, `ilike.`/`or=`, `order=`, `limit=`, upsert via
 * `on_conflict`, and `Prefer: count=exact` HEAD requests for usage counts).
 * See e2e/README.md for the tradeoffs.
 */

const FAKE_USER_ID = "00000000-0000-4000-8000-000000000001";
const FAKE_USER_EMAIL = "e2e@example.test";

interface Filter {
  column: string;
  operator: string;
  value: string;
  negate: boolean;
}

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

const nowIso = () => new Date().toISOString();

const uuid = (): string => {
  // crypto.randomUUID is available in the Playwright-driven browser context.
  return crypto.randomUUID();
};

const createStore = (): Store => ({
  items: [],
  item_lots: [],
  consumption_logs: [],
  shopping_list_items: [],
  shopping_list_templates: [],
  shopping_list_template_items: [],
  categories: [
    {
      id: uuid(),
      user_id: FAKE_USER_ID,
      name: "Pantry",
      color: "#f97316",
      icon: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
  storage_locations: [
    {
      id: uuid(),
      user_id: FAKE_USER_ID,
      name: "Fridge",
      icon: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
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
  notification_preferences: [],
  push_subscriptions: [],
  item_tags: [],
  items_to_tags: [],
  user_security_questions: [],
});

const parseFilters = (searchParams: URLSearchParams): Filter[] => {
  const structuralKeys = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
  const filters: Filter[] = [];
  for (const [column, raw] of searchParams.entries()) {
    if (structuralKeys.has(column) || column === "or") continue;
    let value = raw;
    let negate = false;
    if (value.startsWith("not.")) {
      negate = true;
      value = value.slice(4);
    }
    const dotIndex = value.indexOf(".");
    if (dotIndex === -1) continue;
    const operator = value.slice(0, dotIndex);
    const operand = value.slice(dotIndex + 1);
    filters.push({ column, operator, value: operand, negate });
  }
  return filters;
};

const likeToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) =>
    c === "*" || c === "%" ? c : `\\${c}`,
  );
  return new RegExp(`^${escaped.replaceAll("%", ".*").replaceAll("*", ".*")}$`, "i");
};

const matchesFilter = (row: Row, filter: Filter): boolean => {
  const rowValue = row[filter.column];
  let result: boolean;
  switch (filter.operator) {
    case "eq":
      result = String(rowValue) === filter.value;
      break;
    case "is":
      result =
        filter.value === "null"
          ? rowValue === null || rowValue === undefined
          : String(rowValue) === filter.value;
      break;
    case "ilike":
    case "like":
      result = typeof rowValue === "string" && likeToRegExp(filter.value).test(rowValue);
      break;
    case "in": {
      const values = filter.value.replace(/^\(|\)$/g, "").split(",");
      result = values.includes(String(rowValue));
      break;
    }
    default:
      // Unsupported operator (gt/lt/etc.) — don't filter it out; this mock only
      // needs to support the narrow set of queries the app issues.
      result = true;
  }
  return filter.negate ? !result : result;
};

const matchesOrParam = (row: Row, orParam: string): boolean => {
  const inner = orParam.replace(/^\(/, "").replace(/\)$/, "");
  const conditions = inner.split(",");
  return conditions.some((cond) => {
    const [column, operator, ...rest] = cond.split(".");
    if (!column || !operator) return false;
    const value = rest.join(".").replace(/^"|"$/g, "");
    return matchesFilter(row, { column, operator, value, negate: false });
  });
};

const applyOrder = (rows: Row[], order: string | null): Row[] => {
  if (!order) return rows;
  const [column, direction] = order.split(".");
  if (!column) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = a[column];
    const bv = b[column];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return av > bv ? 1 : -1;
  });
  return direction === "desc" ? sorted.reverse() : sorted;
};

/**
 * Installs request interception for `**\/auth/v1/**`, `**\/rest/v1/**`, and
 * `**\/realtime/v1/**` on the given page, backed by an in-memory store.
 * Also pre-seeds a couple of master-data rows (one category, one storage
 * location) so the item form has something to show.
 */
export const installSupabaseMock = async (page: Page): Promise<Store> => {
  const store = createStore();

  await page.route("**/realtime/v1/**", (route: Route) => route.abort());

  await page.route("**/auth/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
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
      access_token: "e2e-fake-access-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "e2e-fake-refresh-token",
      user,
    };

    if (url.pathname.endsWith("/auth/v1/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session),
      });
      return;
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(user),
      });
      return;
    }
    if (url.pathname.endsWith("/auth/v1/logout")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    // Session bootstrap / misc endpoints (settings, etc.) — return something benign.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });

  await page.route("**/rest/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace(/^.*\/rest\/v1\//, "");
    if (!(table in store)) store[table] = [];
    const rows = store[table]!;
    const method = request.method();
    const accept = request.headers().accept ?? "";
    const wantsSingle = accept.includes("vnd.pgrst.object+json");
    const filters = parseFilters(url.searchParams);
    const orParam = url.searchParams.get("or");

    const matches = (row: Row) =>
      filters.every((f) => matchesFilter(row, f)) && (!orParam || matchesOrParam(row, orParam));

    if (method === "HEAD" || method === "GET") {
      let result = rows.filter(matches);
      result = applyOrder(result, url.searchParams.get("order"));
      const limitParam = url.searchParams.get("limit");
      if (limitParam) result = result.slice(0, Number(limitParam));

      if (method === "HEAD") {
        await route.fulfill({
          status: 200,
          headers: { "content-range": `0-0/${result.length}` },
          body: "",
        });
        return;
      }

      if (wantsSingle) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result[0] ?? null),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
      return;
    }

    if (method === "POST") {
      const body = request.postDataJSON() as Row | Row[];
      const inputRows = Array.isArray(body) ? body : [body];
      const prefer = request.headers().prefer ?? "";
      const isUpsert = prefer.includes("resolution=");
      const inserted: Row[] = [];
      for (const input of inputRows) {
        let existingIndex = -1;
        if (isUpsert && input.id) {
          existingIndex = rows.findIndex((r) => r.id === input.id);
        }
        if (existingIndex >= 0) {
          const merged = { ...rows[existingIndex], ...input, updated_at: nowIso() };
          rows[existingIndex] = merged;
          inserted.push(merged);
        } else {
          const row: Row = {
            id: uuid(),
            created_at: nowIso(),
            updated_at: nowIso(),
            ...input,
          };
          rows.push(row);
          inserted.push(row);
        }
      }
      const responseBody = Array.isArray(body) ? inserted : (inserted[0] ?? null);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(wantsSingle ? (inserted[0] ?? null) : responseBody),
      });
      return;
    }

    if (method === "PATCH") {
      const body = request.postDataJSON() as Row;
      const updated: Row[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (matches(rows[i]!)) {
          rows[i] = { ...rows[i], ...body };
          updated.push(rows[i]!);
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(wantsSingle ? (updated[0] ?? null) : updated),
      });
      return;
    }

    if (method === "DELETE") {
      const removed: Row[] = [];
      store[table] = rows.filter((row) => {
        if (matches(row)) {
          removed.push(row);
          return false;
        }
        return true;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(wantsSingle ? (removed[0] ?? null) : removed),
      });
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  return store;
};

/** Navigates to `/login`, signs in through the real form, and waits for the dashboard. */
export const loginAsFakeUser = async (page: Page): Promise<void> => {
  await page.goto("/login");
  await page.locator("#email").fill(FAKE_USER_EMAIL);
  await page.locator("#password").fill("e2e-password-not-checked");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/$/);
};
