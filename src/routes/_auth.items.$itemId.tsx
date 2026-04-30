import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Edit, Hash, MapPin, Package, StickyNote, Trash2, Zap } from "lucide-react";
import { type ReactNode,useState } from "react";
import { useTranslation } from "react-i18next";

import { ExpiryBadge } from "@/components/atoms/ExpiryBadge";
import { ItemImage } from "@/components/atoms/ItemImage";
import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeleteItem, useItem } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
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
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, error } = useItem(itemId);
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: userSettings } = useUserSettings();
  const deleteItem = useDeleteItem();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    return <div className="flex min-h-[200px] items-center justify-center"><Spinner /></div>;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-lg border border-destructive p-4 text-destructive">
          アイテムが見つかりません
        </div>
      </div>
    );
  }

  const isEmpty = item.units === 0;
  const totalDisplay = item.opened_remaining !== null && item.opened_remaining !== undefined
    ? `${item.units}点（開封中: ${item.opened_remaining}${item.content_unit}）`
    : `${item.units}点 × ${item.content_amount}${item.content_unit}`;

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={showDeleteConfirm}
        title="在庫を削除"
        message={t("deleteConfirm")}
        confirmLabel="削除"
        onConfirm={() => { void handleDelete(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Link to="/items/$itemId/consume" params={{ itemId }}>
            <Button variant="outline" size="sm" disabled={isEmpty}>
              <Zap className="mr-1 h-4 w-4" />
              {t("consume")}
            </Button>
          </Link>
          <Link to="/items/$itemId/edit" params={{ itemId }}>
            <Button variant="outline" size="icon">
              <Edit className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteItem.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Item image */}
      <ItemImage
        imagePath={item.image_path}
        alt={item.name}
        className="h-40 w-full rounded-lg"
      />

      {/* Name + badges */}
      <div>
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <div className="mt-1 flex flex-wrap gap-2">
          {category && <Badge variant="secondary">{category.name}</Badge>}
          {isEmpty && <Badge variant="outline" className="text-muted-foreground">使い切り</Badge>}
          <ExpiryBadge expiryDate={item.expiry_date} warningDays={userSettings?.expiry_warning_days} />
        </div>
      </div>

      {/* Details */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <DetailRow
            icon={<Package className="h-4 w-4" />}
            label={t("units")}
            value={totalDisplay}
          />
          {item.barcode && (
            <DetailRow icon={<Hash className="h-4 w-4" />} label={t("barcode")} value={item.barcode} />
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
              value={new Date(item.purchase_date).toLocaleDateString("ja-JP")}
            />
          )}
          {item.expiry_date && (
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label={t("expiryDate")}
              value={new Date(item.expiry_date).toLocaleDateString("ja-JP")}
            />
          )}
          {item.notes && (
            <DetailRow icon={<StickyNote className="h-4 w-4" />} label={t("notes")} value={item.notes} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId")({
  component: ItemDetailPage,
});
