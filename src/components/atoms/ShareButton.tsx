import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canShare } from "@/lib/share";

interface ShareButtonProps {
  title: string;
  text: string;
  label?: string;
}

export const ShareButton = ({ title, text, label }: ShareButtonProps) => {
  if (!canShare()) return null;

  const handleShare = async () => {
    try {
      await navigator.share({ title, text });
    } catch {
      // User cancelled or share failed — no action needed
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void handleShare();
      }}
    >
      <Share2 className="h-4 w-4" />
      {label}
    </Button>
  );
};
