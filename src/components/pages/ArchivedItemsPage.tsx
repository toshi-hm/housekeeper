import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useDeletedItems, useDeleteItemPermanently, useRestoreItem } from "@/hooks/useItems";
import type { Item } from "@/types/item";

export const ArchivedItemsPage = () => {
  const { t } = useTranslation("settings");
  const { t: ti } = useTranslation("items");
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useDeletedItems();
  const restoreItem = useRestoreItem();
  const deleteItemPermanently = useDeleteItemPermanently();
  /** #1099: 完全削除の確認ダイアログ対象アイテム。確認メッセージに名前を埋め込むため
   *  id だけでなく Item そのものを保持する。 */
  const [purgeTarget, setPurgeTarget] = useState<Item | null>(null);

  const handlePurgeConfirm = () => {
    if (!purgeTarget) return;
    deleteItemPermanently.mutate(
      { id: purgeTarget.id, imagePath: purgeTarget.image_path },
      { onSuccess: () => setPurgeTarget(null) },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ConfirmDialog
        open={!!purgeTarget}
        title={t("purgeItemConfirmTitle")}
        message={purgeTarget ? t("purgeItemConfirmMessage", { name: purgeTarget.name }) : ""}
        confirmLabel={t("purgeItem")}
        isConfirming={deleteItemPermanently.isPending}
        onConfirm={handlePurgeConfirm}
        onCancel={() => setPurgeTarget(null)}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t("backToSettings")}
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
            <li key={item.id} className="flex flex-wrap items-center gap-3 p-3">
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
                onClick={() => restoreItem.mutate(item.id)}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t("restore")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={deleteItemPermanently.isPending}
                onClick={() => setPurgeTarget(item)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t("purgeItem")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
