import { useCallback, useEffect, useRef, useState } from "react";

import { type ToastVariant, useToast } from "@/lib/toast-context";

interface UndoableEntry<TPayload> {
  id: string;
  payload: TPayload;
}

export interface UseUndoableActionOptions<TPayload> {
  /**
   * Called when the user undoes the action — either via the toast's action
   * button (when `showToast` is true) or by calling `undo(id)` directly from
   * a caller-rendered control — before the undo window expires.
   */
  onUndo: (id: string, payload: TPayload) => Promise<void> | void;
  /**
   * Called once the undo window elapses without the user undoing. Optional —
   * omit when there is nothing left to finalize (the underlying mutation
   * already ran to completion and simply becomes irreversible).
   */
  onExpire?: (id: string, payload: TPayload) => Promise<void> | void;
  /**
   * Undo window in ms. Omit to keep the pending entry open indefinitely
   * until `undo()` is called explicitly — matches the expiry calendar's
   * persistent "pending removals" list, which has no auto-expiry.
   */
  durationMs?: number;
  /**
   * Show a toast (with an action button wired to `undo`) when `start()` is
   * called. Defaults to true. Set to false when the caller renders its own
   * pending-undo UI instead (e.g. an inline list).
   */
  showToast?: boolean;
  /** Builds the toast message from the payload. Required when `showToast` is true. */
  message?: (payload: TPayload) => string;
  /** Toast action-button label (e.g. "元に戻す" / "Undo"). Required when `showToast` is true. */
  undoLabel?: string;
  /** Toast variant for the success toast. Defaults to "success". */
  variant?: ToastVariant;
  /** Toast message shown (as an "error" toast) if `onUndo` throws. */
  undoErrorMessage?: string;
}

export interface UseUndoableActionResult<TPayload> {
  /** Register a just-completed action as undoable and open its undo window. */
  start: (id: string, payload: TPayload) => void;
  /** Undo a pending action (also invoked by the toast's action button). */
  undo: (id: string) => Promise<void>;
  /** Currently pending (not-yet-undone, not-yet-expired) entries, keyed by id. */
  pending: Record<string, TPayload>;
  /** Same as `pending`, as a list — convenient for rendering. */
  pendingList: UndoableEntry<TPayload>[];
}

/**
 * Generalizes the "undo snackbar" pattern originally implemented ad hoc in
 * the expiry calendar's `useCalendarConsume`: run a mutation immediately,
 * then keep the pre-mutation state around for a window during which the
 * user can undo it (rather than blocking on a confirm dialog beforehand).
 *
 * Reuses the shared toast's action-button mechanism to show the "元に戻す"
 * (Undo) control, unless `showToast: false` is passed for callers that
 * render their own pending-undo UI.
 */
export const useUndoableAction = <TPayload>(
  options: UseUndoableActionOptions<TPayload>,
): UseUndoableActionResult<TPayload> => {
  const { toast, dismiss } = useToast();
  const [pending, setPending] = useState<Record<string, TPayload>>({});
  // Mirrors `pending` synchronously (state updates are async) so undo()/timer
  // callbacks always read the latest payload for an id.
  const pendingRef = useRef<Record<string, TPayload>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastIds = useRef<Record<string, string>>({});
  const undoPromises = useRef<Record<string, Promise<void>>>({});
  const optionsRef = useRef(options);
  // Refs must not be written during render — sync it in an effect (runs
  // after every render, no dependency array) instead.
  useEffect(() => {
    optionsRef.current = options;
  });

  const removeEntry = useCallback(
    (id: string) => {
      const timer = timers.current[id];
      if (timer !== undefined) {
        clearTimeout(timer);
        delete timers.current[id];
      }
      const toastId = toastIds.current[id];
      if (toastId !== undefined) {
        dismiss(toastId);
        delete toastIds.current[id];
      }
      if (id in pendingRef.current) {
        delete pendingRef.current[id];
        setPending((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [dismiss],
  );

  const undo = useCallback(
    (id: string): Promise<void> => {
      const existing = undoPromises.current[id];
      if (existing) return existing;

      const payload = pendingRef.current[id];
      if (payload === undefined) return Promise.resolve();

      const promise = (async () => {
        try {
          await optionsRef.current.onUndo(id, payload);
          // Only clear the pending entry once the undo actually succeeds, so a
          // failed undo (e.g. offline) leaves the action undo-able for retry
          // instead of silently becoming permanent.
          removeEntry(id);
        } catch (err) {
          if (optionsRef.current.undoErrorMessage) {
            toast(optionsRef.current.undoErrorMessage, "error");
          }
          throw err;
        } finally {
          delete undoPromises.current[id];
        }
      })();
      undoPromises.current[id] = promise;
      return promise;
    },
    [removeEntry, toast],
  );

  const start = useCallback(
    (id: string, payload: TPayload) => {
      removeEntry(id);
      pendingRef.current[id] = payload;
      setPending((prev) => ({ ...prev, [id]: payload }));

      const opts = optionsRef.current;
      if (opts.showToast !== false) {
        const toastId = toast(opts.message?.(payload) ?? "", opts.variant ?? "success", {
          action: {
            label: opts.undoLabel ?? "",
            onClick: () => {
              // The toast already reports the configured error. Swallow the
              // rejection here so a click cannot create an unhandled promise;
              // callers invoking undo(id) directly still receive the error.
              void undo(id).catch(() => undefined);
            },
          },
          durationMs: opts.durationMs,
        });
        toastIds.current[id] = toastId;
      }

      if (opts.durationMs !== undefined) {
        timers.current[id] = setTimeout(() => {
          delete timers.current[id];
          delete toastIds.current[id];
          const finalPayload = pendingRef.current[id];
          if (finalPayload === undefined) return;
          delete pendingRef.current[id];
          setPending((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
          void opts.onExpire?.(id, finalPayload);
        }, opts.durationMs);
      }
    },
    [removeEntry, toast, undo],
  );

  // Clear any outstanding timers on unmount so a delayed onExpire never fires
  // against stale closures after the component using this hook is gone.
  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      for (const timer of Object.values(timersMap)) clearTimeout(timer);
    };
  }, []);

  const pendingList = Object.entries(pending).map(([id, payload]) => ({ id, payload }));

  return { start, undo, pending, pendingList };
};
