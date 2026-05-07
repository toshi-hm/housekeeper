import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Edit,
  Hash,
  History,
  MapPin,
  Package,
  RefreshCw,
  StickyNote,
  Trash2,
  Zap,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { ExpiryBadge } from "@/components/atoms/ExpiryBadge";
import { ItemImage } from "@/components/atoms/ItemImage";
import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConsumptionLogs } from "@/hooks/useConsumptionLogs";
import { useDeleteItem, useItem } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { useUpsertShoppingItem } from "@/hooks/useShoppingList";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useToast } from "@/lib/toast";

const DetailRow = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 text-muted-foreground">{icon}</span>
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  </div>
);

const ItemDetailPage = () => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, error } = useItem(itemId);
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: userSettings } = useUserSettings();
  const deleteItem = useDeleteItem();
  const upsertShopping = useUpsertShoppingItem();
  const { data: logs = [] } = useConsumptionLogs(itemId);
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [detailTab, setDetailTab] = useState<"info" | "history">("info");

  const handleRestock = async () => {
    if (!item) return;
    try {
      await upsertShopping.mutateAsync({ name: item.name, linked_item_id: item.id });
      toast(t("restockSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const category = categories.find((c) => c.id === item?.category_id);
  const location = locations.find((l) => l.id === item?.storage_location_id);

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteItem.mutateAsync(itemId);
      toast(t("deleteSuccess"), "success");
      void navigate({ to: "/" });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-lg border border-destructive p-4 text-destructive">
          {t("itemNotFound")}
        </div>
      </div>
    );
  }

  const isEmpty = item.units === 0;
  const totalDisplay =
    item.opened_remaining !== null && item.opened_remaining !== undefined
      ? t("totalDisplayOpened", {
          units: item.units,
          remaining: item.opened_remaining,
          unit: item.content_unit,
        })
      : t("totalDisplaySealed", {
          units: item.units,
          amount: item.content_amount,
          unit: item.content_unit,
        });

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("deleteItemTitle")}
        message={t("deleteConfirm")}
        confirmLabel={tc("delete")}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          aria-label={tc("back")}
          onClick={() => void navigate({ to: "/" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isEmpty}
            onClick={() => void navigate({ to: "/items/$itemId/consume", params: { itemId } })}
          >
            <Zap className="h-4 w-4" />
            {t("consume")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRestock()}
            disabled={upsertShopping.isPending}
          >
            <RefreshCw className="h-4 w-4" />
            {t("shopping:restock")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={tc("edit")}
            onClick={() => void navigate({ to: "/items/$itemId/edit", params: { itemId } })}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            aria-label={tc("delete")}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteItem.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop: image + details side-by-side */}
      <div className="lg:flex lg:gap-6">
        {/* Item image */}
        <ItemImage
          imagePath={item.image_path}
          alt={item.name}
          className="h-40 w-full rounded-lg lg:h-64 lg:w-64 lg:shrink-0"
        />

        <div className="mt-4 flex flex-1 flex-col space-y-4 lg:mt-0">
          {/* Name + badges */}
          <div>
            <h1 className="text-2xl font-bold">{item.name}</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              {category && <Badge variant="secondary">{category.name}</Badge>}
              {isEmpty && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("emptyStock")}
                </Badge>
              )}
              <ExpiryBadge
                expiryDate={item.expiry_date}
                warningDays={userSettings?.expiry_warning_days}
              />
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex rounded-lg border p-1">
            <button
              className={`flex flex-1 items-center justify-center gap-1 rounded py-1.5 text-sm font-medium transition-colors ${detailTab === "info" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setDetailTab("info")}
            >
              <Package className="h-4 w-4" />
              {t("itemDetail")}
            </button>
            <button
              className={`flex flex-1 items-center justify-center gap-1 rounded py-1.5 text-sm font-medium transition-colors ${detailTab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setDetailTab("history")}
            >
              <History className="h-4 w-4" />
              {t("consumeHistory")}
              {logs.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-xs">
                  {logs.length}
                </span>
              )}
            </button>
          </div>

          {detailTab === "info" ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <DetailRow
                  icon={<Package className="h-4 w-4" />}
                  label={t("units")}
                  value={totalDisplay}
                />
                {item.barcode && (
                  <DetailRow
                    icon={<Hash className="h-4 w-4" />}
                    label={t("barcode")}
                    value={item.barcode}
                  />
                )}
                {location && (
                  <DetailRow
                    icon={<MapPin className="h-4 w-4" />}
                    label={t("storageLocation")}
                    value={location.name}
                  />
                )}
                {item.purchase_date && (
                  <DetailRow
                    icon={<Calendar className="h-4 w-4" />}
                    label={t("purchaseDate")}
                    value={new Date(item.purchase_date).toLocaleDateString()}
                  />
                )}
                {item.expiry_date && (
                  <DetailRow
                    icon={<Calendar className="h-4 w-4" />}
                    label={t("expiryDate")}
                    value={new Date(item.expiry_date).toLocaleDateString()}
                  />
                )}
                {item.notes && (
                  <DetailRow
                    icon={<StickyNote className="h-4 w-4" />}
                    label={t("notes")}
                    value={item.notes}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
              ) : (
                logs.map((log) => (
                  <Card key={log.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            −{log.delta_amount}
                            {log.delta_unit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {log.units_before} → {log.units_after} {t("units")}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.occurred_at).toLocaleDateString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId")({
  component: ItemDetailPage,
});
