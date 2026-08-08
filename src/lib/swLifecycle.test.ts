import { describe, expect, mock, test } from "bun:test";

import { registerSwAutoUpdateLifecycle, SKIP_WAITING_MESSAGE } from "@/lib/swLifecycle";

/** Minimal fake `ServiceWorkerGlobalScope` — just enough for
 * `registerSwAutoUpdateLifecycle` to exercise its wiring. */
class FakeScope extends EventTarget {
  skipWaiting = mock(() => Promise.resolve());
  clients = { claim: mock(() => Promise.resolve()) };
}

describe("registerSwAutoUpdateLifecycle (#785)", () => {
  test("calls skipWaiting() only in response to the SKIP_WAITING_MESSAGE message", () => {
    const scope = new FakeScope();
    registerSwAutoUpdateLifecycle(scope);

    scope.dispatchEvent(new MessageEvent("message", { data: "something-else" }));
    expect(scope.skipWaiting).not.toHaveBeenCalled();

    scope.dispatchEvent(new MessageEvent("message", { data: SKIP_WAITING_MESSAGE }));
    expect(scope.skipWaiting).toHaveBeenCalledTimes(1);
  });

  test("does not call skipWaiting() just because the worker installed (no message)", () => {
    const scope = new FakeScope();
    registerSwAutoUpdateLifecycle(scope);

    // No "install" listener is registered by this module at all — skipWaiting
    // is deliberately only ever triggered by an explicit message (#785).
    expect(scope.skipWaiting).not.toHaveBeenCalled();
  });

  test("claims clients on activate, extending the event's lifetime via waitUntil", () => {
    const scope = new FakeScope();
    registerSwAutoUpdateLifecycle(scope);

    let waited: Promise<unknown> | undefined;
    const event = new Event("activate");
    Object.defineProperty(event, "waitUntil", {
      value: (p: Promise<unknown>) => {
        waited = p;
      },
    });
    scope.dispatchEvent(event);

    expect(scope.clients.claim).toHaveBeenCalledTimes(1);
    expect(waited).toBe(scope.clients.claim.mock.results[0]?.value as Promise<unknown>);
  });
});
