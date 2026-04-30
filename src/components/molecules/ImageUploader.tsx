import { Camera, Trash2, Upload } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploaderProps {
  previewUrl?: string | null;
  isUploading?: boolean;
  onFile: (file: File) => void;
  onDelete?: () => void;
}

export const ImageUploader = ({
  previewUrl,
  isUploading,
  onFile,
  onDelete,
}: ImageUploaderProps) => {
  const { t } = useTranslation("items");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  const validate = (file: File): string => {
    if (!ALLOWED_TYPES.includes(file.type)) return t("imageErrorType");
    if (file.size > MAX_SIZE_BYTES) return t("imageErrorSize");
    return "";
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    onFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2">
      {previewUrl ? (
        <div className="relative">
          <img src={previewUrl} alt="" className="h-40 w-full rounded-lg object-cover" />
          <div className="absolute right-2 top-2 flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4" />
            </Button>
            {onDelete && (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-8 w-8"
                onClick={onDelete}
                disabled={isUploading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 text-sm text-white">
              {t("imageUploading")}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("imageDrop")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <Camera className="mr-1 h-4 w-4" />
            {t("imageCapture")}
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};
