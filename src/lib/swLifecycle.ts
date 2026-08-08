/** Message payload the client posts to a waiting worker to accept an update. */
export const SKIP_WAITING_MESSAGE = "SKIP_WAITING";

/** The minimal shape of `ServiceWorkerGlobalScope` this module needs — kept
 * narrow so it can be exercised with a lightweight fake in tests without
 * pulling in a real `ServiceWorkerGlobalScope`. Also avoids referencing the
 * ambient `WebWorker`-lib-only `ExtendableEvent` global, which isn't
 * available under `tsconfig.app.json` (this file is imported by both
 * `sw.ts`, type-checked under `tsconfig.sw.json`, and by `pwa.ts`, type-
 * checked under the regular DOM-lib app config). */
interface WaitUntilEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface SwLifecycleScope extends EventTarget {
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void> };
}

/**
 * #785: Wires the Service Worker side of a deliberately *deferred*
 * "autoUpdate". A newly-installed worker is left in the browser's normal
 * `waiting` state until the page explicitly asks it to take over — by
 * posting `SKIP_WAITING_MESSAGE`, which `src/lib/pwa.ts` only sends after
 * the user clicks the "reload" action on the update toast
 * (`useSwUpdatePrompt`).
 *
 * Calling `skipWaiting()` unconditionally on every install (the naive fix
 * for the underlying "updates never activate" bug) would let
 * `clients.claim()` hand control of an already-open tab to the new worker
 * while that tab is still running the OLD build's JS. Any lazily-loaded
 * chunk that tab requests afterwards would look for an old-hashed filename
 * that isn't in the new worker's precache manifest and no longer exists on
 * the server after a deploy — breaking the still-open tab instead of
 * updating it, and undermining the offline-reference guarantee in
 * docs/specs/features/pwa.md if the tab goes offline in that window.
 * Gating `skipWaiting()` behind an explicit message means the handoff only
 * ever happens right as the page is about to fully reload and re-fetch
 * everything fresh (see the `controllerchange` handler in
 * `createSwRegistrationHandler`).
 *
 * `clients.claim()` on `activate` is left unconditional: for the very
 * first-ever install there is nothing else controlling the scope yet (a
 * harmless no-op change of control), and for a deferred update it only
 * takes effect once the explicit message has let the worker reach
 * `activating`.
 */
export const registerSwAutoUpdateLifecycle = (scope: SwLifecycleScope): void => {
  scope.addEventListener("message", (event) => {
    if ((event as MessageEvent<unknown>).data === SKIP_WAITING_MESSAGE) {
      void scope.skipWaiting();
    }
  });

  scope.addEventListener("activate", (event) => {
    (event as WaitUntilEvent).waitUntil(scope.clients.claim());
  });
};
