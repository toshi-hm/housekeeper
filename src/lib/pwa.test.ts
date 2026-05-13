import { afterEach, describe, expect, mock, test } from "bun:test";

import { createSwRegistrationHandler } from "@/lib/pwa";

describe("createSwRegistrationHandler", () => {
  const originalServiceWorker = navigator.serviceWorker;
  let cleanupSW: (() => void) | undefined;

  afterEach(() => {
    cleanupSW?.();
    cleanupSW = undefined;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
  });

  test("registers service worker on window load", async () => {
    const register = mock(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    cleanupSW = createSwRegistrationHandler();
    window.dispatchEvent(new Event("load"));

    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });
});
