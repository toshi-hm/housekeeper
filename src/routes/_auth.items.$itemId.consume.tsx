import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsumeItem } from "@/hooks/useConsumeItem";
import { useItem } from "@/hooks/useItems";
import { useToast } from "@/lib/toast";
import { computeConsumption } from "@/types/item";

const ItemConsumePage = () => {
  const { t } = useTranslation("items");
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItem(itemId);
  const consumeItem = useConsumeItem();
  const { toast } = useToast();
  const [delta, setDelta] = useState("");
  const [validationError, setValidationError] = useState("");

  const deltaNum = parseFloat(delta);
  const preview = item && !isNaN(deltaNum) && deltaNum > 0
    ? computeConsumption(item, deltaNum)
    : null;

  const handleSubmit = async () => {
    if (!item) return;
    const amount = parseFloat(delta);
    if (isNaN(amount) || amount <= 0) {
      setValidationError("0より大きい値を入力してください");
      return;
    }
    const result = computeConsumption(item, amount);
    if (result.error) {
      setValidationError(result.error);
      return;
    }
    try {
      await consumeItem.mutateAsync({ item, deltaAmount: amount });
      toast(t("consumeSuccess"), "success");
      void navigate({ to: "/items/$itemId", params: { itemId } });
    } catch {
      toast(t("consumeError"), "error");
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[200px] items-center justify-center"><Spinner /></div>;
  }

  if (!item) {
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

  const currentDisplay = item.opened_remaining !== null && item.opened_remaining !== undefined
    ? `開封中: ${item.opened_remaining}${item.content_unit} + 未開封${item.units > 0 ? item.units - 1 : 0}点`
    : `${item.units}点 × ${item.content_amount}${item.content_unit}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void navigate({ to: "/items/$itemId", params: { itemId } })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("consumeItem")}</h1>
      </div>

      {/* Current state */}
      <div className="rounded-lg bg-muted p-4">
        <p className="font-semibold">{item.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">現在の在庫: {currentDisplay}</p>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <Label htmlFor="delta">
          {t("consumeAmount")} ({item.content_unit})
        </Label>
        <Input
          id="delta"
          type="number"
          min={0.01}
          step={0.01}
          value={delta}
          onChange={(e) => {
            setDelta(e.target.value);
            setValidationError("");
          }}
          placeholder={t("consumeAmountPlaceholder")}
          autoFocus
        />
        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
      </div>

      {/* Preview */}
      {preview && !preview.error && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium text-muted-foreground">消費後の在庫（プレビュー）</p>
          <p className="mt-1">
            {preview.units_after}点
            {preview.opened_remaining_after !== null && preview.opened_remaining_after !== undefined
              ? `（開封中: ${preview.opened_remaining_after}${item.content_unit}）`
              : ""}
          </p>
        </div>
      )}
      {preview?.error && (
        <p className="text-sm text-destructive">{preview.error}</p>
      )}

      <Button
        className="w-full"
        onClick={() => { void handleSubmit(); }}
        disabled={consumeItem.isPending || !delta || parseFloat(delta) <= 0}
      >
        {consumeItem.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
        {t("consume")}
      </Button>
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId/consume")({
  component: ItemConsumePage,
});
