import { Link } from "@tanstack/react-router";
import { Calendar, Hash,MapPin, Package } from "lucide-react";

import { ExpiryBadge } from "@/components/ExpiryBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getExpiryStatus, type Item } from "@/types/item";

interface ItemCardProps {
  item: Item;
}

export const ItemCard = ({ item }: ItemCardProps) => {
  const expiryStatus = getExpiryStatus(item.expiry_date);
  const isUrgent = expiryStatus === "expired" || expiryStatus === "expiring-soon";

  return (
    <Link to="/items/$itemId" params={{ itemId: item.id }}>
      <Card
        className={cn(
          "h-full transition-shadow hover:shadow-md cursor-pointer",
          isUrgent && "border-yellow-400",
          expiryStatus === "expired" && "border-red-400",
        )}
      >
        {item.image_url ? (
          <div className="relative aspect-square overflow-hidden rounded-t-lg">
            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-t-lg bg-muted">
            <Package className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <CardContent className="p-3">
          <h3 className="font-semibold leading-tight line-clamp-2">{item.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {item.category && (
              <Badge variant="outline" className="text-xs">
                {item.category}
              </Badge>
            )}
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {item.storage_location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{item.storage_location}</span>
              </div>
            )}
            {item.barcode && (
              <div className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span className="truncate">{item.barcode}</span>
              </div>
            )}
            {item.expiry_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{new Date(item.expiry_date).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between p-3 pt-0">
          <span className="text-sm font-medium">Qty: {item.quantity}</span>
          <ExpiryBadge expiryDate={item.expiry_date} />
        </CardFooter>
      </Card>
    </Link>
  );
};
