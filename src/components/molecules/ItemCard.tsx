import { Link } from "@tanstack/react-router";
import { Calendar, MapPin, Minus, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ExpiryBadge } from "@/components/atoms/ExpiryBadge";
import { ItemImage } from "@/components/atoms/ItemImage";
import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { parseLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { formatRemaining, getExpiryStatus, type Item } from "@/types/item";

interface ItemCardProps {
  item: Item;
  categoryName?: string | undefined;
  locationName?: string | undefined;
  warningDays?: number;
  onQuickConsume?: (item: Item) => void;
  isQuickConsuming?: boolean;
}

export const ItemCard = ({
  item,
  categoryName,
  locationName,
  warningDays,
  onQuickConsume,
  isQuickConsuming = false,
}: ItemCardProps) => {
  const { t, i18n } = useTranslation("items");
  const expiryStatus = getExpiryStatus(item.expiry_date, warningDays);
  const isUrgent = expiryStatus === "expired" || expiryStatus === "expiring-soon";
  const isEmpty = item.units === 0;

  return (
    <Link to="/items/$itemId" params={{ itemId: item.id }}>
      <Card
        className={cn(
          "h-full cursor-pointer transition-shadow hover:shadow-md",
          isUrgent && !isEmpty && "border-yellow-400",
          expiryStatus === "expired" && !isEmpty && "border-red-400",
          isEmpty && "opacity-50",
        )}
      >
        <ItemImage
          imagePath={item.image_path}
          alt={item.name}
          className="aspect-square rounded-t-lg"
        />
        <CardContent className="p-3">
          <h3 className="line-clamp-2 font-semibold leading-tight">{item.name}</h3>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {categoryName && (
              <div className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                <span>{categoryName}</span>
              </div>
            )}
            {locationName && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{locationName}</span>
              </div>
            )}
            {item.expiry_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{parseLocalDate(item.expiry_date).toLocaleDateString(i18n.language)}</span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between p-3 pt-0">
          <span className="text-sm font-medium">
            {isEmpty ? (
              <span className="text-muted-foreground">{t("emptyStock")}</span>
            ) : (
              <span>
                {t("unitsDisplay", { units: item.units })}
                {item.opened_remaining !== null && item.opened_remaining !== undefined && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {t("remainingDisplay", {
                      amount: formatRemaining(
                        item.units,
                        item.content_amount,
                        item.opened_remaining,
                      ),
                      unit: item.content_unit,
                    })}
                  </span>
                )}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            {!isEmpty && onQuickConsume && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={t("quickConsume")}
                disabled={isQuickConsuming}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickConsume(item);
                }}
              >
                {isQuickConsuming ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <ExpiryBadge expiryDate={item.expiry_date} warningDays={warningDays} />
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
};
