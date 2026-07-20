import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface ImageLightboxProps {
  open: boolean;
  imageUrl: string | null | undefined;
  alt?: string;
  onClose: () => void;
}

export const ImageLightbox = ({ open, imageUrl, alt = "", onClose }: ImageLightboxProps) => {
  const { t } = useTranslation("common");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !imageUrl) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoredElements: Array<{
      element: HTMLElement;
      inert: boolean;
      ariaHidden: string | null;
    }> = [];
    let branch: HTMLElement | null = dialogRef.current;
    while (branch?.parentElement && branch.parentElement !== document.body) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        restoredElements.push({
          element: sibling,
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute("aria-hidden"),
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      branch = parent;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      for (const { element, inert, ariaHidden } of restoredElements) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      previouslyFocused?.focus();
    };
  }, [imageUrl, onClose, open]);

  // 画像がない場合は何も表示しない（ガード）
  if (!open || !imageUrl) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label={t("close")}
        className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={imageUrl}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        style={{ touchAction: "pinch-zoom" }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};
