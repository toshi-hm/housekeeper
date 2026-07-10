import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  afterEach(() => {
    localStorage.removeItem("theme");
    document.documentElement.classList.remove("dark");
  });

  test("初期値は localStorage がなければ system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  test("setTheme で保存され dark クラスが切り替わる", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("light");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("localStorage の値を初期値として読む", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });
});

describe("useTheme (system テーマと matchMedia)", () => {
  interface MediaQueryStub {
    matches: boolean;
    media: string;
    addEventListener: (event: string, handler: () => void) => void;
    removeEventListener: (event: string, handler: () => void) => void;
  }

  const installMatchMedia = (matches: boolean) => {
    const listeners: Array<{ event: string; handler: () => void }> = [];
    const queries: string[] = [];
    const mq: MediaQueryStub = {
      matches,
      media: "",
      addEventListener: (event, handler) => listeners.push({ event, handler }),
      removeEventListener: (event, handler) => {
        const index = listeners.findIndex(
          (entry) => entry.event === event && entry.handler === handler,
        );
        if (index >= 0) listeners.splice(index, 1);
      },
    };
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => {
        queries.push(query);
        return mq as unknown as MediaQueryList;
      },
    });
    return {
      mq,
      listeners,
      queries,
      restore: () => {
        Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
      },
    };
  };

  test("system + OS ダーク設定なら dark クラスを付け、change で追従する", () => {
    const stub = installMatchMedia(true);
    try {
      const { unmount } = renderHook(() => useTheme());

      // (prefers-color-scheme: dark) を問い合わせている
      expect(stub.queries[0]).toBe("(prefers-color-scheme: dark)");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      // change リスナーが登録され、OS 設定の変化に追従する
      expect(stub.listeners).toEqual([
        { event: "change", handler: expect.any(Function) as unknown as () => void },
      ]);
      stub.mq.matches = false;
      act(() => {
        stub.listeners[0]!.handler();
      });
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // アンマウントでリスナー解除
      unmount();
      expect(stub.listeners).toHaveLength(0);
    } finally {
      stub.restore();
      document.documentElement.classList.remove("dark");
    }
  });

  test("system + OS ライト設定では dark クラスを付けない", () => {
    const stub = installMatchMedia(false);
    try {
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    } finally {
      stub.restore();
    }
  });

  test("dark へ切り替えると system の change リスナーが解除される", () => {
    const stub = installMatchMedia(false);
    try {
      const { result } = renderHook(() => useTheme());
      expect(stub.listeners).toHaveLength(1);

      act(() => {
        result.current.setTheme("dark");
      });
      expect(stub.listeners).toHaveLength(0);
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    } finally {
      stub.restore();
      localStorage.removeItem("theme");
      document.documentElement.classList.remove("dark");
    }
  });
});
