import { SKIP_WAITING_MESSAGE } from "@/lib/swLifecycle";

export const updateAppBadge = async (urgentCount: number): Promise<void> => {
  if (!("setAppBadge" in navigator)) return;
  try {
    if (urgentCount > 0) {
      await navigator.setAppBadge(urgentCount);
    } else {
      await navigator.clearAppBadge();
    }
  } catch {
    // Badge API may be blocked by permissions or not fully supported
  }
};

/** Called by a listener to accept a pending update (posts the SKIP_WAITING
 * message to the waiting worker; the page reloads once it actually takes
 * control — see the `controllerchange` handler in
 * `createSwRegistrationHandler`, not this call itself). */
interface ApplyUpdate {
  (): void;
}

interface SwUpdateListener {
  (applyUpdate: ApplyUpdate): void;
}

const swUpdateListeners = new Set<SwUpdateListener>();

/**
 * Subscribes to "a service worker update is available" notifications
 * (#785). Returns an unsubscribe function. Intended for a small React hook
 * mounted once near the app root (inside the toast provider) to surface a
 * non-destructive "reload to update" prompt — see `useSwUpdatePrompt`. The
 * listener receives an `applyUpdate` callback to invoke if/when the user
 * accepts (e.g. clicking the toast's action button); calling it is what
 * actually triggers the update — the app never applies it on its own.
 *
 * Note: if a *newer* update supersedes the one a still-visible toast was
 * built for, that toast's `applyUpdate` becomes a harmless no-op (it
 * `postMessage`s a now-redundant worker, which the browser silently
 * ignores) rather than throwing — the user simply still has the newer
 * toast to accept instead.
 */
export const onSwUpdateAvailable = (listener: SwUpdateListener): (() => void) => {
  swUpdateListeners.add(listener);
  return () => swUpdateListeners.delete(listener);
};

const notifySwUpdateAvailable = (applyUpdate: ApplyUpdate) => {
  for (const listener of swUpdateListeners) listener(applyUpdate);
};

/**
 * Notifies listeners for a worker sitting in the registration's `waiting`
 * slot (a `ServiceWorker.state` of `"installed"` that hasn't been asked to
 * activate yet). Only treated as a genuine update when this page is already
 * under an existing controller — i.e. there's a previous version actually
 * being superseded, not the very first install (#785).
 */
const notifyIfWaiting = (worker: ServiceWorker | null) => {
  if (worker?.state === "installed" && navigator.serviceWorker.controller) {
    notifySwUpdateAvailable(() => worker.postMessage(SKIP_WAITING_MESSAGE));
  }
};

/** Checks a worker's current state right away (covers it already being
 * `"installed"`/waiting) and subscribes to its future state changes (covers
 * it still being `"installing"`, on its way to `"installed"`). */
const watchWorker = (worker: ServiceWorker | null) => {
  if (!worker) return;
  notifyIfWaiting(worker);
  worker.addEventListener("statechange", () => notifyIfWaiting(worker));
};

/**
 * Watches a service worker registration for updates. Covers three cases,
 * all of which real deploy/multi-tab timing can produce (#785):
 * - An update that finished installing *before* this page load (e.g. the
 *   user ignored an earlier toast and simply reloaded/reopened the app
 *   later) already sits in `registration.waiting` by the time `register()`
 *   resolves.
 * - An update that's still mid-install (`registration.installing`) at that
 *   same moment — e.g. another tab's periodic update check, or the
 *   browser's own, kicked one off moments before this call. `"updatefound"`
 *   already fired for that worker (before we started listening for it), so
 *   only watching for a *future* `"updatefound"` would miss it entirely.
 * - A new install that starts while this page is open, tracked via
 *   `"updatefound"` -> the new worker's `statechange` reaching `"installed"`.
 */
const watchForUpdate = (registration: ServiceWorkerRegistration) => {
  watchWorker(registration.waiting);
  watchWorker(registration.installing);

  registration.addEventListener("updatefound", () => watchWorker(registration.installing));
};

export const createSwRegistrationHandler = (): (() => void) => {
  const handler = () => {
    // Initialized *before* any update-driven controller swap can happen. A
    // `controllerchange` event fires whenever this tab's controller is
    // replaced — including on the very first install of a brand new visit
    // (no controller -> a controller, via clients.claim() in
    // src/lib/swLifecycle.ts), which must NOT reload (there's nothing to
    // refresh; the page just loaded under that exact worker's precache).
    // Once this tab already has a controller, though, ANY later
    // controllerchange means a previous version is being swapped out from
    // under it — reload regardless of whether *this* tab was the one that
    // clicked "reload" on the update toast: clients.claim() hands every
    // open tab of the origin to the new worker together, so a tab that
    // didn't click anything still needs to refresh to stop running old
    // build JS against the new worker's precache (#785).
    //
    // This is deliberately a `let`, re-armed after every event rather than
    // captured once: right after a controllerchange fires, this tab
    // necessarily has *some* controller (whether this was its first one or
    // a replacement), so any event after the first must reload — including
    // a brand-new visitor's tab that later lives long enough to receive a
    // genuine future update in that same session.
    let hadController = navigator.serviceWorker.controller !== null;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const shouldReload = hadController;
      hadController = true;
      if (shouldReload) window.location.reload();
    });

    void navigator.serviceWorker.register("/sw.js").then(
      (registration) => {
        try {
          watchForUpdate(registration);
        } catch (err: unknown) {
          // oxlint-disable-next-line no-console
          console.error("[PWA] Failed to watch for service worker updates:", err);
        }
      },
      (err: unknown) => {
        // oxlint-disable-next-line no-console
        console.error("[PWA] Service worker registration failed:", err);
      },
    );
  };
  window.addEventListener("load", handler);
  return () => window.removeEventListener("load", handler);
};

export const registerPwaServiceWorker = (): (() => void) | undefined => {
  if (!import.meta.env.PROD || typeof window === "undefined" || !("serviceWorker" in navigator))
    return;
  return createSwRegistrationHandler();
};
