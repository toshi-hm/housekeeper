import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface ImageLightboxProps {
  open: boolean;
  imageUrl: string | null | undefined;
  alt?: string;
  onClose: () => void;
}

export const ImageLightbox = ({ open, imageUrl, alt = "", onClose }: ImageLightboxProps) => {
  const { t } = useTranslation("common");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 画像がない場合は何も表示しない（ガード）
  if (!open || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
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
