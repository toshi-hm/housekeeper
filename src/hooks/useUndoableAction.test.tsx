import { act, renderHook } from "@testing-library/react";
import { describe, expect, mock, test, vi } from "bun:test";
import { createElement, type ReactNode } from "react";

import { useUndoableAction } from "@/hooks/useUndoableAction";
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

/** A minimal stand-in for ToastProvider that records every toast()/dismiss() call. */
const makeToastContext = () => {
  const calls: ToastCall[] = [];
  const dismissed: string[] = [];
  let nextId = 0;

  const toast = mock((message: string, variant?: ToastVariant, options?: ToastOptions) => {
    const id = `toast-${nextId++}`;
    calls.push({ id, message, variant, options });
    return id;
  });
  const dismiss = mock((id: string) => {
    dismissed.push(id);
  });

  const value: ToastContextValue = { toasts: [], toast, dismiss };
  return { value, calls, dismissed, toast, dismiss };
};

const makeWrapper =
  (value: ToastContextValue) =>
  ({ children }: { children: ReactNode }) =>
    createElement(ToastContext.Provider, { value }, children);

interface Payload {
  name: string;
}

describe("useUndoableAction", () => {
  test("start() shows a toast with an undo action button wired to undo()", () => {
    const { value, calls } = makeToastContext();
    const onUndo = mock(async () => {});

    const { result } = renderHook(
      () =>
        useUndoableAction<Payload>({
          onUndo,
          message: (p) => `Removed ${p.name}`,
          undoLabel: "Undo",
          durationMs: 5000,
        }),
      { wrapper: makeWrapper(value) },
    );

    act(() => {
      result.current.start("a1", { name: "Milk" });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.message).toBe("Removed Milk");
    expect(calls[0]?.variant).toBe("success");
    expect(calls[0]?.options?.action?.label).toBe("Undo");
    expect(result.current.pending).toEqual({ a1: { name: "Milk" } });
    expect(result.current.pendingList).toEqual([{ id: "a1", payload: { name: "Milk" } }]);
  });

  test("showToast: false never calls toast() (calendar's own pending-list UI case)", () => {
    const { value, calls } = makeToastContext();
    const { result } = renderHook(
      () => useUndoableAction<Payload>({ onUndo: async () => {}, showToast: false }),
      { wrapper: makeWrapper(value) },
    );

    act(() => {
      result.current.start("a1", { name: "Milk" });
    });

    expect(calls).toHaveLength(0);
    expect(result.current.pending).toEqual({ a1: { name: "Milk" } });
  });

  test("undo() before the window elapses calls onUndo, dismisses the toast, and clears the pending entry", async () => {
    const { value, calls, dismissed } = makeToastContext();
    const onUndo = mock(async () => {});

    const { result } = renderHook(
      () =>
        useUndoableAction<Payload>({
          onUndo,
          message: (p) => `Removed ${p.name}`,
          undoLabel: "Undo",
          durationMs: 5000,
        }),
      { wrapper: makeWrapper(value) },
    );

    act(() => {
      result.current.start("a1", { name: "Milk" });
    });
    const toastId = calls[0]!.id;

    // Simulates tapping the toast's action button, which wires to undo(id).
    await act(async () => {
      await result.current.undo("a1");
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith("a1", { name: "Milk" });
    expect(dismissed).toContain(toastId);
    expect(result.current.pending).toEqual({});
    expect(result.current.pendingList).toEqual([]);
  });

  test("deduplicates repeated undo calls while the restore is still running", async () => {
    const { value } = makeToastContext();
    let finishUndo: (() => void) | undefined;
    const onUndo = mock(
      () =>
        new Promise<void>((resolve) => {
          finishUndo = resolve;
        }),
    );

    const { result } = renderHook(
      () => useUndoableAction<Payload>({ onUndo, message: () => "msg", undoLabel: "Undo" }),
      { wrapper: makeWrapper(value) },
    );

    act(() => {
      result.current.start("a1", { name: "Milk" });
    });

    let firstUndo: Promise<void> | undefined;
    let secondUndo: Promise<void> | undefined;
    act(() => {
      firstUndo = result.current.undo("a1");
      secondUndo = result.current.undo("a1");
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(secondUndo).toBe(firstUndo);

    await act(async () => {
      finishUndo?.();
      await firstUndo;
    });

    expect(result.current.pending).toEqual({});
  });

  test("auto-expires and calls onExpire once durationMs elapses without an undo (fake timers)", () => {
    vi.useFakeTimers();
    try {
      const { value } = makeToastContext();
      const onUndo = mock(async () => {});
      const onExpire = mock(async () => {});

      const { result } = renderHook(
        () =>
          useUndoableAction<Payload>({
            onUndo,
            onExpire,
            message: () => "msg",
            undoLabel: "Undo",
            durationMs: 5000,
          }),
        { wrapper: makeWrapper(value) },
      );

      act(() => {
        result.current.start("a1", { name: "Milk" });
      });
      expect(result.current.pending["a1"]).toEqual({ name: "Milk" });

      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(onExpire).not.toHaveBeenCalled();
      expect(result.current.pending["a1"]).toEqual({ name: "Milk" });

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(onExpire).toHaveBeenCalledWith("a1", { name: "Milk" });
      expect(onUndo).not.toHaveBeenCalled();
      expect(result.current.pending).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  test("undoing before expiry cancels the pending auto-expire timer (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const { value } = makeToastContext();
      const onUndo = mock(async () => {});
      const onExpire = mock(async () => {});

      const { result } = renderHook(
        () => useUndoableAction<Payload>({ onUndo, onExpire, durationMs: 5000 }),
        { wrapper: makeWrapper(value) },
      );

      act(() => {
        result.current.start("a1", { name: "Milk" });
      });

      // Await the undo so its removeEntry (which clears the pending
      // setTimeout) actually runs before we advance the fake clock —
      // otherwise the cleared timer would still be sitting in the timer
      // queue and fire below.
      await act(async () => {
        await result.current.undo("a1");
      });

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onExpire).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("without durationMs, a pending entry never auto-expires (matches the calendar's indefinite undo list)", () => {
    vi.useFakeTimers();
    try {
      const { value } = makeToastContext();
      const onExpire = mock(async () => {});

      const { result } = renderHook(
        () => useUndoableAction<Payload>({ onUndo: async () => {}, onExpire, showToast: false }),
        { wrapper: makeWrapper(value) },
      );

      act(() => {
        result.current.start("a1", { name: "Milk" });
      });

      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(onExpire).not.toHaveBeenCalled();
      expect(result.current.pending["a1"]).toEqual({ name: "Milk" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("a failing onUndo keeps the entry pending for retry instead of discarding it", async () => {
    const { value } = makeToastContext();
    const error = new Error("offline");
    const onUndo = mock(async () => {
      throw error;
    });

    const { result } = renderHook(
      () => useUndoableAction<Payload>({ onUndo, message: () => "msg", undoLabel: "Undo" }),
      { wrapper: makeWrapper(value) },
    );

    act(() => {
      result.current.start("a1", { name: "Milk" });
    });

    await act(async () => {
      try {
        await result.current.undo("a1");
        throw new Error("expected undo() to reject");
      } catch (err) {
        expect(err).toBe(error);
      }
    });

    // Still pending — a retry should be possible instead of the action
    // silently becoming permanent because the reversal failed.
    expect(result.current.pending).toEqual({ a1: { name: "Milk" } });
  });

  test("undo() on an unknown id is a no-op", async () => {
    const { value } = makeToastContext();
    const onUndo = mock(async () => {});

    const { result } = renderHook(() => useUndoableAction<Payload>({ onUndo }), {
      wrapper: makeWrapper(value),
    });

    await act(async () => {
      await result.current.undo("does-not-exist");
    });

    expect(onUndo).not.toHaveBeenCalled();
  });

  test("supports multiple independent pending entries keyed by id (e.g. checking off several calendar lots in a row)", () => {
    const { value, calls } = makeToastContext();
    const onUndo = mock(async () => {});

    const { result } = renderHook(
      () => useUndoableAction<Payload>({ onUndo, message: (p) => p.name, undoLabel: "Undo" }),
      { wrapper: makeWrapper(value) },
    );

    act(() => {
      result.current.start("lot-1", { name: "Milk" });
      result.current.start("lot-2", { name: "Eggs" });
    });

    expect(calls).toHaveLength(2);
    expect(result.current.pending).toEqual({
      "lot-1": { name: "Milk" },
      "lot-2": { name: "Eggs" },
    });
  });

  test("clears outstanding timers on unmount so onExpire never fires afterwards (fake timers)", () => {
    vi.useFakeTimers();
    try {
      const { value } = makeToastContext();
      const onExpire = mock(async () => {});

      const { result, unmount } = renderHook(
        () =>
          useUndoableAction<Payload>({
            onUndo: async () => {},
            onExpire,
            durationMs: 1000,
            showToast: false,
          }),
        { wrapper: makeWrapper(value) },
      );

      act(() => {
        result.current.start("a1", { name: "Milk" });
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onExpire).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
