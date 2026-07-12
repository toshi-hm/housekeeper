import { PackageCheck, PackageSearch, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ScanToShoppingDialogProps {
  open: boolean;
  /** バーコード照合中（在庫検索 / API 問い合わせ）かどうか */
  isLooking: boolean;
  /** 解決された商品名（在庫一致名 or API 取得名、未取得なら空文字） */
  defaultName: string;
  /** 既存の在庫アイテムに一致したか */
  matchedExisting: boolean;
  isSubmitting?: boolean;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export const ScanToShoppingDialog = ({
  open,
  isLooking,
  defaultName,
  matchedExisting,
  isSubmitting,
  onConfirm,
  onClose,
}: ScanToShoppingDialogProps) => {
  const { t } = useTranslation("shopping");
  const [name, setName] = useState(defaultName);
  const [prevDefaultName, setPrevDefaultName] = useState(defaultName);

  // 照合完了後に解決済みの商品名を入力欄へ反映する（prop 変化時の state 調整）
  if (defaultName !== prevDefaultName) {
    setPrevDefaultName(defaultName);
    setName(defaultName);
  }

  if (!open) return null;

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center">
      <div className="w-full rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("scanDialogTitle")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isSubmitting}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {isLooking ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Spinner />
            <span className="text-sm">{t("scanLookingUp")}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-sm">
              {matchedExisting ? (
                <>
                  <PackageCheck className="h-5 w-5 shrink-0 text-primary" />
                  <span>{t("scanMatchedExisting")}</span>
                </>
              ) : (
                <>
                  <PackageSearch className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span>{t("scanNewProduct")}</span>
                </>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="scan-name">{t("itemName")}</Label>
              <Input
                id="scan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("itemNamePlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                }}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleConfirm}
                disabled={!name.trim() || isSubmitting}
              >
                {t("scanAddConfirm")}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t("common:cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
