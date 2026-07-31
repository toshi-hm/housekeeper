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
 * 元々 `ConfirmDialog` が持っていた素朴なEscapeハンドラ（フォーカストラップ無し）
 * を発展させ、自前実装している他のダイアログ全般に適用できる共通フックとして
 * 切り出したもの。`ConfirmDialog` / `DeletionReasonDialog` 自身も #654 でこの
 * フックへ移行済み。
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
      // ダイアログを開いた際のトリガー要素が、閉じる操作と同じレンダリングで
      // DOMから消えているケース（例: 成功時にトリガーごと非表示になるフォーム）
      // では、既に切断された要素への focus() は何もしない（#698）。呼び出し側が
      // 別途フォーカス移動先を明示した場合、ここで意図せず上書きしないようにする。
      if (previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [open]);

  return containerRef;
};
