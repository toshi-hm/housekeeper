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
  const [loadFailed, setLoadFailed] = useState(false);
  const [prevUrl, setPrevUrl] = useState(url);

  // URLが変わったら（差し替え・再取得等）フォールバック状態をリセットする（レンダー中の状態調整）
  if (url !== prevUrl) {
    setPrevUrl(url);
    setLoadFailed(false);
  }

  if (!imagePath || !url || loadFailed) {
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
      onError={() => setLoadFailed(true)}
    />
  );
};
