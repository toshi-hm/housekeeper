import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { createSwRegistrationHandler, registerPwaServiceWorker, updateAppBadge } from "@/lib/pwa";

interface BadgeNavigator extends Navigator {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

const nav = navigator as BadgeNavigator;

describe("updateAppBadge", () => {
  const originalSet = nav.setAppBadge;
  const originalClear = nav.clearAppBadge;

  afterEach(() => {
    if (originalSet) nav.setAppBadge = originalSet;
    else delete nav.setAppBadge;
    if (originalClear) nav.clearAppBadge = originalClear;
    else delete nav.clearAppBadge;
  });

  test("Badge API がなければ何もしない", async () => {
    delete nav.setAppBadge;
    await updateAppBadge(3);
  });

  test("件数 > 0 なら setAppBadge を呼ぶ", async () => {
    const setBadge = mock(() => Promise.resolve());
    const clearBadge = mock(() => Promise.resolve());
    nav.setAppBadge = setBadge;
    nav.clearAppBadge = clearBadge;

    await updateAppBadge(5);

    expect(setBadge).toHaveBeenCalledWith(5);
    expect(clearBadge).not.toHaveBeenCalled();
  });

  test("件数 0 なら clearAppBadge を呼ぶ", async () => {
    const setBadge = mock(() => Promise.resolve());
    const clearBadge = mock(() => Promise.resolve());
    nav.setAppBadge = setBadge;
    nav.clearAppBadge = clearBadge;

    await updateAppBadge(0);

    expect(clearBadge).toHaveBeenCalled();
    expect(setBadge).not.toHaveBeenCalled();
  });

  test("Badge API が例外を投げても握りつぶす", async () => {
    nav.setAppBadge = () => Promise.reject(new Error("blocked"));
    await updateAppBadge(1);
  });
});

describe("createSwRegistrationHandler (エラー)", () => {
  test("register 失敗は console.error に記録される", async () => {
    const originalSW = navigator.serviceWorker;
    const register = mock(() => Promise.reject(new Error("register failed")));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    try {
      const cleanupHandler = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await new Promise((resolve) => setTimeout(resolve, 10));
      cleanupHandler();
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalSW,
      });
    }
  });
});

describe("registerPwaServiceWorker", () => {
  test("非 PROD 環境では undefined を返す", () => {
    // bun test では import.meta.env.PROD は falsy
    expect(registerPwaServiceWorker()).toBeUndefined();
  });
});

describe("createSwRegistrationHandler (イベント名とログ内容)", () => {
  test("load イベントに登録され、解除後は発火しない", async () => {
    const originalSW = navigator.serviceWorker;
    const register = mock(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    const addSpy = spyOn(window, "addEventListener");
    const removeSpy = spyOn(window, "removeEventListener");

    try {
      const cleanupHandler = createSwRegistrationHandler();
      expect((addSpy.mock.calls[0] as unknown[])[0]).toBe("load");

      cleanupHandler();
      expect((removeSpy.mock.calls[0] as unknown[])[0]).toBe("load");
      // 登録した handler と同一の関数を解除している
      expect((removeSpy.mock.calls[0] as unknown[])[1]).toBe(
        (addSpy.mock.calls[0] as unknown[])[1],
      );
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalSW,
      });
    }
  });

  test("register 失敗ログは [PWA] プレフィックス付きで出力される", async () => {
    const originalSW = navigator.serviceWorker;
    const failure = new Error("register failed");
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: () => Promise.reject(failure) },
    });
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    try {
      const cleanupHandler = createSwRegistrationHandler();
      window.dispatchEvent(new Event("load"));
      await new Promise((resolve) => setTimeout(resolve, 10));
      cleanupHandler();

      expect(errorSpy).toHaveBeenCalledWith("[PWA] Service worker registration failed:", failure);
    } finally {
      errorSpy.mockRestore();
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalSW,
      });
    }
  });
});
