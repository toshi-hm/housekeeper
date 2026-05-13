import { afterEach, describe, expect, mock, test } from "bun:test";

import { registerPwaServiceWorker } from "@/lib/pwa";

describe("registerPwaServiceWorker", () => {
  const originalServiceWorker = navigator.serviceWorker;

  afterEach(() => {
    window.onload = null;
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

    registerPwaServiceWorker();
    window.dispatchEvent(new Event("load"));

    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });
});
