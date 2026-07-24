import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogA11yOptions {
  open: boolean;
  onClose: () => void;
  /** 送信中などでEscapeキーによる閉鎖を一時的に無効化する */
  disableClose?: boolean;
}

/**
 * 自前実装のモーダルダイアログ共通のアクセシビリティ挙動（#631）:
 * - Escapeキーで閉じる
 * - フォーカストラップ（Tab/Shift+Tabをダイアログ内に閉じ込める）
 * - オープン時にダイアログ内へ初期フォーカス
 * - クローズ時にオープン前のフォーカスを復元
 *
 * `ConfirmDialog`（`role="alertdialog"` + Escapeハンドラ）と同じパターンを、
 * 自前実装している他のダイアログにも適用するための共通フックとして切り出した。
 * `onClose`/`disableClose` はrefで保持し、依存配列は `open` のみにすることで、
 * 呼び出し側が毎レンダーで新しい関数を渡しても再フォーカス/再トラップが起きない
 * ようにしている。
 */
export const useDialogA11y = <T extends HTMLElement>({
  open,
  onClose,
  disableClose = false,
}: UseDialogA11yOptions) => {
  const containerRef = useRef<T>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const disableCloseRef = useRef(disableClose);

  // 最新のonClose/disableCloseをrefに保持する。依存配列を[open]のみにしている
  // 下のuseEffectは呼び出し側が毎レンダー新しい関数を渡しても再実行されないため、
  // ここで別途最新値に同期する必要がある。
  useEffect(() => {
    onCloseRef.current = onClose;
    disableCloseRef.current = disableClose;
  });

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const firstFocusable = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? container)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!disableCloseRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  return containerRef;
};
