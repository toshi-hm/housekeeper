import { type ReactNode, useCallback, useState } from "react";

import { type Toast, ToastContext, type ToastVariant } from "@/lib/toast-context";

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "default") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
};

const variantClasses: Record<ToastVariant, string> = {
  default: "bg-gray-800 text-white",
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  warning: "bg-yellow-500 text-black",
};

const ToastContainer = ({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) => {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.variant === "error" ? "alert" : "status"}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${variantClasses[t.variant]}`}
        >
          <span>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 opacity-70 hover:opacity-100"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
