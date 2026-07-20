import { createContext, useContext } from "react";

export type ToastVariant = "default" | "success" | "error" | "warning";

export interface ToastAction {
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
  /** クリックすると `onClick` を実行するアクションボタン（例: 「元に戻す」）。 */
  action?: ToastAction;
  /** 自動で消えるまでの時間 (ms)。省略時はデフォルト（4000ms、actionありは5000ms）。 */
  durationMs?: number;
}

export interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};
