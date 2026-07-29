import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type Toast,
  ToastContext,
  type ToastOptions,
  type ToastVariant,
} from "@/lib/toast-context";

interface TimerEntry {
  timeoutId: ReturnType<typeof setTimeout>;
  /** このタイマーが残り何msでdismissを実行するか（一時停止/再開の計算用） */
  remainingMs: number;
  /** 直近でタイマーを開始/再開した時刻（Date.now()） */
  startedAt: number;
}

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // #673: Undo付きトーストがキーボード/スクリーンリーダー利用者に到達される前に
  // 固定タイマーで自動消滅してしまう問題への対応。トースト要素にhover/focusして
  // いる間はタイマーを一時停止し、離れたら残り時間で再開する。
  const timersRef = useRef(new Map<string, TimerEntry>());
  // 自動消滅(タイマー満了)時にのみ呼ぶコールバック。手動close/dismiss()経由では
  // 呼ばない（例: useUndoableActionのUndo成功時にonExpireを誤って呼ばないため）。
  const autoDismissRef = useRef(new Map<string, () => void>());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer.timeoutId);
      timersRef.current.delete(id);
    }
    autoDismissRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleTimerElapsed = useCallback(
    (id: string) => {
      const onAutoDismiss = autoDismissRef.current.get(id);
      autoDismissRef.current.delete(id);
      onAutoDismiss?.();
      dismiss(id);
    },
    [dismiss],
  );

  const scheduleDismiss = useCallback(
    (id: string, ms: number) => {
      const timeoutId = setTimeout(() => handleTimerElapsed(id), ms);
      timersRef.current.set(id, { timeoutId, remainingMs: ms, startedAt: Date.now() });
    },
    [handleTimerElapsed],
  );

  const pauseTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer) return;
    clearTimeout(timer.timeoutId);
    const elapsed = Date.now() - timer.startedAt;
    timer.remainingMs = Math.max(0, timer.remainingMs - elapsed);
  }, []);

  const resumeTimer = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (!timer) return;
      timer.startedAt = Date.now();
      timer.timeoutId = setTimeout(() => handleTimerElapsed(id), timer.remainingMs);
    },
    [handleTimerElapsed],
  );

  const toast = useCallback(
    (message: string, variant: ToastVariant = "default", options?: ToastOptions): string => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant, action: options?.action }]);
      if (options?.onAutoDismiss) autoDismissRef.current.set(id, options.onAutoDismiss);
      // #673: Undo等のactionを含むトーストは元々6000msだったが、気づいてから
      // クリックするまでの猶予をより確保するため8000msに延長した
      // (hover/focus中の一時停止と合わせた対応)。
      const durationMs = options?.durationMs ?? (options?.action ? 8000 : 4000);
      scheduleDismiss(id, durationMs);
      return id;
    },
    [scheduleDismiss],
  );

  const { t } = useTranslation("common");

  return (
    <ToastContext value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismiss}
        onPause={pauseTimer}
        onResume={resumeTimer}
        closeLabel={t("close")}
      />
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
  onPause,
  onResume,
  closeLabel,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  closeLabel: string;
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
          onMouseEnter={() => onPause(t.id)}
          onMouseLeave={() => onResume(t.id)}
          onFocus={() => onPause(t.id)}
          onBlur={() => onResume(t.id)}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action?.onClick();
              }}
              className="shrink-0 rounded-md border border-current/40 px-2 py-1 text-xs font-semibold whitespace-nowrap hover:bg-white/10"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 shrink-0 opacity-70 hover:opacity-100"
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
