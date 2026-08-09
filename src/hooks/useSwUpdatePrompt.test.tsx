import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { useSwUpdatePrompt } from "@/hooks/useSwUpdatePrompt";
import i18n from "@/lib/i18n";
import { createSwRegistrationHandler } from "@/lib/pwa";
import {
  ToastContext,
  type ToastContextValue,
  type ToastOptions,
  type ToastVariant,
} from "@/lib/toast-context";

interface ToastCall {
  id: string;
  message: string;
  variant?: ToastVariant;
  options?: ToastOptions;
}

/** Minimal EventTarget-based stand-ins for the real SW registration/worker/container objects
 * (mirrors src/lib/pwa.test.ts's fixtures — see that file for why each needs to be a real
 * EventTarget: createSwRegistrationHandler calls .addEventListener on all three). */
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
  triggerUpdateFound(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: unknown = {};
  registration: FakeRegistration;
  register: ReturnType<typeof mock>;
  constructor(registration: FakeRegistration) {
    super();
    this.registration = registration;
    this.register = mock(() =>
      Promise.resolve(registration as unknown as ServiceWorkerRegistration),
    );
  }
  simulateControllerChange() {
    this.dispatchEvent(new Event("controllerchange"));
  }
}

const makeWrapper = (toastCalls: ToastCall[], dismissedIds: string[]) => {
  let nextId = 0;
  const toast = mock((message: string, variant?: ToastVariant, options?: ToastOptions) => {
    const id = `toast-${nextId++}`;
    toastCalls.push({ id, message, variant, options });
    return id;
  });
  const dismiss = mock((id: string) => {
    dismissedIds.push(id);
  });
  const value: ToastContextValue = { toasts: [], toast, dismiss };

  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(I18nextProvider, { i18n }, createElement(ToastContext, { value }, children));
  return { Wrapper, toast, dismiss };
};

describe("useSwUpdatePrompt (#785)", () => {
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

  /**
   * Registers a fake service worker (already-controlled, mimicking a page
   * that's had the SW active since before this update) and returns a helper
   * that fires the "a new worker just finished installing" sequence, plus
   * the worker/container so a test can simulate what happens after the user
   * accepts the update (postMessage, then controllerchange -> reload).
   */
  const setupFakeSwUpdate = async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });

    cleanupSW = createSwRegistrationHandler();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();

    const fireUpdate = () => {
      const worker = new FakeWorker("installing");
      registration.triggerUpdateFound(worker);
      worker.setState("installed");
      return worker;
    };
    return { fireUpdate, container };
  };

  test("shows a toast with a reload action when a SW update becomes available", async () => {
    await i18n.changeLanguage("ja");
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls, []);
    const { fireUpdate } = await setupFakeSwUpdate();

    renderHook(() => useSwUpdatePrompt(), { wrapper: Wrapper });
    fireUpdate();

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]?.message).toBe("更新があります。再読み込みしてください");
    expect(toastCalls[0]?.options?.action?.label).toBe("再読み込み");
  });

  test("the reload action posts SKIP_WAITING and reloads only once the new worker takes control", async () => {
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls, []);
    const { fireUpdate, container } = await setupFakeSwUpdate();

    renderHook(() => useSwUpdatePrompt(), { wrapper: Wrapper });
    const worker = fireUpdate();

    const reload = mock(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    toastCalls[0]?.options?.action?.onClick();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    // Must not reload before the new worker has actually taken control.
    expect(reload).not.toHaveBeenCalled();

    container.simulateControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // #785: a second update landing before the user acted on the first must
  // replace the stale toast rather than stack a second one — otherwise the
  // first toast's action button lingers as a silent no-op (it would
  // postMessage a now-redundant, terminated worker).
  test("replaces a still-visible update toast when a newer update supersedes it", async () => {
    const toastCalls: ToastCall[] = [];
    const dismissedIds: string[] = [];
    const { Wrapper } = makeWrapper(toastCalls, dismissedIds);
    const { fireUpdate } = await setupFakeSwUpdate();

    renderHook(() => useSwUpdatePrompt(), { wrapper: Wrapper });
    fireUpdate();
    fireUpdate();

    expect(toastCalls).toHaveLength(2);
    expect(dismissedIds).toEqual([toastCalls[0]?.id]);
  });

  test("unsubscribes from update notifications on unmount", async () => {
    const toastCalls: ToastCall[] = [];
    const { Wrapper } = makeWrapper(toastCalls, []);
    const { fireUpdate } = await setupFakeSwUpdate();

    const { unmount } = renderHook(() => useSwUpdatePrompt(), { wrapper: Wrapper });
    unmount();
    fireUpdate();

    expect(toastCalls).toHaveLength(0);
  });
});
