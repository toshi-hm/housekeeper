import { Package } from "lucide-react";

import { useSignedItemImage } from "@/hooks/useItemImage";
import { cn } from "@/lib/utils";

interface ItemImageProps {
  imagePath: string | null | undefined;
  alt?: string;
  className?: string;
}

export const ItemImage = ({ imagePath, alt = "", className }: ItemImageProps) => {
  const { data: url } = useSignedItemImage(imagePath);

  if (!imagePath || !url) {
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
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
};
