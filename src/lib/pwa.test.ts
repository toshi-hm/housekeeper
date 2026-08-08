import { afterEach, describe, expect, mock, test } from "bun:test";

import { createSwRegistrationHandler, onSwUpdateAvailable } from "@/lib/pwa";
import { SKIP_WAITING_MESSAGE } from "@/lib/swLifecycle";

/** Minimal EventTarget-based stand-ins for the real SW registration/worker/container objects. */
class FakeWorker extends EventTarget {
  state: string;
  postMessage = mock(() => {});
  constructor(state: string) {
    super();
    this.state = state;
  }
  setState(state: string) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  triggerUpdateFound(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

/** Stands in for `navigator.serviceWorker` (a `ServiceWorkerContainer`, which
 * is itself an `EventTarget` — real browsers fire "controllerchange" on it). */
class FakeServiceWorkerContainer extends EventTarget {
  controller: unknown;
  register: ReturnType<typeof mock>;
  constructor(registration: FakeRegistration, controller: unknown) {
    super();
    this.controller = controller;
    this.register = mock(() =>
      Promise.resolve(registration as unknown as ServiceWorkerRegistration),
    );
  }
  simulateControllerChange() {
    this.dispatchEvent(new Event("controllerchange"));
  }
}

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
    const register = mock(() =>
      // `.then(watchForUpdate)` reads `.waiting`/`.addEventListener` on
      // whatever resolves here, so the stub needs at least that shape.
      Promise.resolve({
        waiting: null,
        addEventListener: () => {},
      } as unknown as ServiceWorkerRegistration),
    );
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: new (class extends EventTarget {
        register = register;
      })(),
    });

    cleanupSW = createSwRegistrationHandler();
    window.dispatchEvent(new Event("load"));

    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  // #785: skipWaiting()/clients.claim() (src/lib/swLifecycle.ts, used by
  // src/sw.ts) only activate a new worker once the client explicitly asks
  // for it — the client side needs to detect an available update and let
  // the user decide (non-destructively) when to apply it.
  test("notifies onSwUpdateAvailable when a new worker installs over an existing controller", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      // A non-null controller means this page is already governed by a
      // previously-installed SW, i.e. this is a genuine update, not the
      // first-ever install.
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      // Two microtask hops: register()'s promise resolving, then the
      // `.then(...)` callback that attaches the "updatefound" listener.
      await Promise.resolve();
      await Promise.resolve();

      const worker = new FakeWorker("installing");
      registration.triggerUpdateFound(worker);
      worker.setState("installed");

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  // #785: "updatefound" only fires for an install that starts *after* we
  // start watching — a worker that was already sitting in
  // `registration.waiting` (e.g. the user ignored an earlier toast and
  // simply reloaded/reopened the app later) must still be surfaced.
  test("notifies onSwUpdateAvailable for a worker already waiting when registration resolves", async () => {
    const registration = new FakeRegistration();
    const alreadyWaiting = new FakeWorker("installed");
    registration.waiting = alreadyWaiting;
    const container = new FakeServiceWorkerContainer(registration, {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  // #785: "updatefound" already fired for a worker that was *already*
  // mid-install (registration.installing) by the time watchForUpdate runs
  // (e.g. another tab's update check started moments earlier) — we can't
  // catch that past event, so we must also watch this pre-existing worker's
  // own statechange directly.
  test("notifies onSwUpdateAvailable for a worker already mid-install when registration resolves", async () => {
    const registration = new FakeRegistration();
    const alreadyInstalling = new FakeWorker("installing");
    registration.installing = alreadyInstalling;
    const container = new FakeServiceWorkerContainer(registration, {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).not.toHaveBeenCalled();
      alreadyInstalling.setState("installed");
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  test("does not notify for a worker already mid-install on the very first install (no pre-existing controller)", async () => {
    const registration = new FakeRegistration();
    const alreadyInstalling = new FakeWorker("installing");
    registration.installing = alreadyInstalling;
    const container = new FakeServiceWorkerContainer(registration, null);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      alreadyInstalling.setState("installed");
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  test("does not notify for an already-waiting worker on the very first install (no pre-existing controller)", async () => {
    const registration = new FakeRegistration();
    const alreadyWaiting = new FakeWorker("installed");
    registration.waiting = alreadyWaiting;
    const container = new FakeServiceWorkerContainer(registration, null);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  test("does not notify on the very first install (no pre-existing controller)", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, null);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      const worker = new FakeWorker("installing");
      registration.triggerUpdateFound(worker);
      worker.setState("installed");

      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  test("ignores state changes other than 'installed'", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const listener = mock(() => {});
    const unsubscribe = onSwUpdateAvailable(listener);
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      const worker = new FakeWorker("installing");
      registration.triggerUpdateFound(worker);
      worker.setState("activating");
      worker.setState("activated");

      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  // #785: applying an update must be an explicit, opt-in action (never
  // triggered automatically) — this is what a toast's "reload" button ends
  // up calling.
  test("applyUpdate posts SKIP_WAITING_MESSAGE to the waiting worker and reloads once it takes control", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const reload = mock(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    let applyUpdate: (() => void) | undefined;
    const unsubscribe = onSwUpdateAvailable((apply) => {
      applyUpdate = apply;
    });
    try {
      cleanupSW = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();

      const worker = new FakeWorker("installing");
      registration.triggerUpdateFound(worker);
      worker.setState("installed");

      expect(applyUpdate).toBeDefined();
      applyUpdate?.();
      expect(worker.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
      // Reload must not happen until the new worker actually takes control.
      expect(reload).not.toHaveBeenCalled();

      container.simulateControllerChange();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  // #785: clients.claim() hands every open tab of the origin to the new
  // worker together, so a *different* tab that never clicked "reload" must
  // still refresh once its own controller is swapped out from under it —
  // it can't keep running old build JS against the new worker's precache.
  test("reloads on a controllerchange this tab never explicitly requested, as long as it already had a controller", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const reload = mock(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    cleanupSW = createSwRegistrationHandler();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();

    // No applyUpdate() call in this tab at all — the controllerchange is
    // purely a side effect of another tab having accepted the update.
    container.simulateControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // #785: clients.claim() fires "controllerchange" on every activation,
  // including the very first install (no prior controller -> a controller).
  // An unrequested reload for a first-time visitor would be a regression.
  test("a controllerchange on the very first install (no pre-existing controller) does not reload", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, null);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const reload = mock(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    cleanupSW = createSwRegistrationHandler();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();

    container.simulateControllerChange();
    expect(reload).not.toHaveBeenCalled();
  });

  // #785 regression: a first-time visitor's tab must still reload for a
  // *later*, genuine update in that same long-lived session — the "skip the
  // very first controllerchange" guard must not silently also skip every
  // controllerchange after it.
  test("does reload on a second controllerchange, even for a tab that started with no controller", async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration, null);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    const reload = mock(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    cleanupSW = createSwRegistrationHandler();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();

    // The first-ever install's clients.claim() controllerchange.
    container.simulateControllerChange();
    expect(reload).not.toHaveBeenCalled();

    // A later, genuine update in the same tab/session.
    container.simulateControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
