import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { useDeletedItems, useRestoreItem } from "@/hooks/useItems";

const ArchivedItemsPage = () => {
  const { t } = useTranslation("settings");
  const { t: ti } = useTranslation("items");
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useDeletedItems();
  const restoreItem = useRestoreItem();

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
        <h1 className="text-xl font-bold">{t("archivedItems")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t("archivedItemsHelp")}</p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("noArchivedItems")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.expiry_date && (
                  <p className="text-xs text-muted-foreground">
                    {ti("expiryDate")}: {item.expiry_date.slice(0, 10)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={restoreItem.isPending}
                onClick={() => {
                  restoreItem.mutate(item.id);
                }}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t("restore")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/archived-items")({
  component: ArchivedItemsPage,
});
