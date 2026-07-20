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
   * Auto-dismiss delay in ms. Defaults to 4000, or 6000 when `action` is
   * present so the user has time to notice and tap the action button.
   */
  durationMs?: number;
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
