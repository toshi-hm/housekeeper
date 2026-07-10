import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { type ReactNode } from "react";

import { ToastContext, type ToastContextValue, useToast } from "@/lib/toast-context";

describe("useToast", () => {
  test("ToastProvider の外で使うと throw する", () => {
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within ToastProvider",
    );
  });

  test("Provider 内ではコンテキスト値を返す", () => {
    const value: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
    );
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current).toBe(value);
  });
});
