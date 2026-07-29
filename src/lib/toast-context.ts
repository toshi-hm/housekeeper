import { createContext, useContext } from "react";

export type ToastVariant = "default" | "success" | "error" | "warning";

/** A single action button rendered on a toast (e.g. "元に戻す" / "Undo"). */
interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export interface ToastOptions {
  /** Optional action button (e.g. an Undo button) rendered on the toast. */
  action?: ToastAction;
  /**
   * Auto-dismiss delay in ms. Defaults to 4000, or 8000 when `action` is
   * present so the user has time to notice and tap the action button
   * (further extended by pausing while the toast has hover/focus, #673).
   */
  durationMs?: number;
  /**
   * Called when the toast's own auto-dismiss timer actually elapses
   * (respecting the hover/focus pause, #673) — NOT called when the toast is
   * dismissed some other way (the close button, or a caller calling
   * `dismiss()` directly, e.g. after a successful undo). Lets callers like
   * `useUndoableAction` finalize an action exactly when its toast visually
   * disappears, instead of running a second, unpausable timer in parallel.
   */
  onAutoDismiss?: () => void;
}

export interface ToastContextValue {
  toasts: Toast[];
  /** Shows a toast and returns its id (e.g. to `dismiss()` it programmatically later). */
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};
