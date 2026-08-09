import { execSync, spawn, type ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * Real Service Worker coverage for #784 (SPA navigation fallback).
 *
 * Every other spec in this directory runs against `vite --mode test`'s dev
 * server (see playwright.config.ts), where `registerPwaServiceWorker()`
 * (src/lib/pwa.ts) never fires because it's gated on `import.meta.env.PROD`
 * — so a real `src/sw.ts` never installs there, and the Workbox
 * `NavigationRoute` fallback this spec verifies is never exercised (see
 * e2e/README.md's "What this does and doesn't cover"). This spec instead
 * builds a real production bundle and serves it with `vite preview`, so the
 * actual Service Worker registers and controls navigations — closing that
 * documented gap for this one regression.
 *
 * Deliberately scoped tight: this only proves a *direct* (non-client-side)
 * navigation to a URL that isn't individually precached — only the app
 * shell ("index.html" plus hashed asset files) is precached; every SPA
 * route like "/login" resolves to its own exact URL that Workbox's precache
 * routing won't match — still loads while offline, instead of the browser's
 * native offline error page. It targets the unauthenticated "/login" route
 * on purpose, so it doesn't need the Supabase auth/REST mock just to prove
 * the fallback works.
 */

const PREVIEW_PORT = 4174;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

let previewProcess: ChildProcess | undefined;

const waitForServer = async (url: string, timeoutMs = 30_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server isn't accepting connections yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Preview server at ${url} did not become ready within ${timeoutMs}ms`);
};

test.describe("Service Worker ナビゲーションフォールバック (#784)", () => {
  test.use({ baseURL: PREVIEW_URL });

  test.beforeAll(() => {
    // `--mode test` loads `.env.test` (the same fake Supabase config the
    // dev server uses). This skips the `tsc -b` typecheck step `bun run
    // build` normally runs first — that's already covered by the `quality`
    // CI job, so re-running it here would just slow this spec down.
    execSync("bunx vite build --mode test", { stdio: "inherit" });
    previewProcess = spawn(
      "bunx",
      ["vite", "preview", "--mode", "test", "--port", String(PREVIEW_PORT), "--strictPort"],
      { stdio: "inherit" },
    );
    return waitForServer(PREVIEW_URL);
  });

  test.afterAll(async () => {
    if (!previewProcess) return;
    const exited = new Promise<void>((resolve) => previewProcess?.once("exit", () => resolve()));
    previewProcess.kill();
    // Wait for the process (and its port) to actually be released before
    // this hook resolves — CI retries the whole file on failure
    // (playwright.config.ts's `retries: 1`), and the next `beforeAll` binds
    // the same `--strictPort` port, so a `kill()` that returns before the
    // OS has reclaimed the socket would make that retry fail with
    // EADDRINUSE instead of re-running cleanly. Cap the wait so a process
    // that ignores SIGTERM can't hang the test run indefinitely.
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  });

  test("オフライン時にプリキャッシュ外のURLへ直接遷移してもApp Shellにフォールバックする", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    // Wait for the real Service Worker (src/sw.ts) to actually take control
    // of *this* page, not just for `registration.active.state ===
    // "activated"`. Those are different moments: `src/lib/swLifecycle.ts`
    // (#785) calls `clients.claim()` inside the `activate` handler via
    // `event.waitUntil(...)`, which resolves asynchronously — the
    // registration can report `active.state === "activated"` a tick before
    // `clients.claim()` has actually finished handing control of this page
    // to the worker. Navigating offline in that gap means this page's
    // client still has no controller, so the request falls through to the
    // real (offline) network instead of the Service Worker's fetch handler
    // — the exact failure this spec exists to catch, just self-inflicted by
    // an early check. `navigator.serviceWorker.controller` is the
    // authoritative signal that control has actually transferred.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 15_000,
    });

    await context.setOffline(true);

    // A fresh top-level navigation (not a client-side route change) to a
    // route with no precache entry of its own.
    const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    // Proves the SPA shell actually loaded and TanStack Router rendered the
    // requested route client-side, not just that *some* 200 response came
    // back.
    await expect(page.locator("#email")).toBeVisible();
  });
});
