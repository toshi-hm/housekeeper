import { Package } from "lucide-react";
import { useState } from "react";

import { useSignedItemImage } from "@/hooks/useItemImage";
import { cn } from "@/lib/utils";

interface ItemImageProps {
  imagePath: string | null | undefined;
  alt?: string;
  className?: string;
  /** Pre-resolved signed URL (e.g. from useSignedItemImages) to skip this component's own fetch. */
  signedUrl?: string;
}

export const ItemImage = ({ imagePath, alt = "", className, signedUrl }: ItemImageProps) => {
  const { data: fetchedUrl } = useSignedItemImage(imagePath, { enabled: !signedUrl });
  const url = signedUrl ?? fetchedUrl;
  // 読み込みに失敗した URL を記録する。URL が差し替わればフォールバック状態は自然に解除される
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const hasError = url !== undefined && erroredUrl === url;

  if (!imagePath || !url || hasError) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <Package className="h-1/3 w-1/3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn("object-cover", className)}
      onError={() => {
        setErroredUrl(url);
      }}
    />
  );
};
