import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { PurchaseHistoryRow } from "@/components/molecules/PurchaseHistoryRow";
import { Button } from "@/components/ui/button";
import { usePurchaseHistory } from "@/hooks/usePurchaseHistory";
import { useUpsertShoppingItem } from "@/hooks/useShoppingList";
import { parseLocalDate } from "@/lib/dateUtils";
import { groupArchivedItemsByDate } from "@/lib/purchaseHistoryView";
import { useToast } from "@/lib/toast-context";

const PurchaseHistoryPage = () => {
  const { t, i18n } = useTranslation("settings");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: archivedItems = [], isLoading } = usePurchaseHistory();
  const upsert = useUpsertShoppingItem();
  const [restockingId, setRestockingId] = useState<string | null>(null);

  const groups = groupArchivedItemsByDate(archivedItems);

  const handleRestock = async (id: string) => {
    const item = archivedItems.find((row) => row.id === id);
    if (!item) return;
    setRestockingId(id);
    try {
      await upsert.mutateAsync({
        name: item.name,
        desired_units: item.desired_units,
        note: item.note,
      });
      toast(t("shopping:restockSuccess"), "success");
    } catch {
      // Error toast is handled by useUpsertShoppingItem.onError
    } finally {
      setRestockingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => void navigate({ to: "/settings" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <History className="h-5 w-5" />
          {t("purchaseHistory")}
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("purchaseHistoryEmpty")}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.dateKey} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {parseLocalDate(group.dateKey).toLocaleDateString(i18n.language, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <PurchaseHistoryRow
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    desiredUnits={item.desired_units}
                    note={item.note}
                    onRestock={(id) => {
                      void handleRestock(id);
                    }}
                    isRestocking={restockingId === item.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/purchase-history")({
  component: PurchaseHistoryPage,
});
