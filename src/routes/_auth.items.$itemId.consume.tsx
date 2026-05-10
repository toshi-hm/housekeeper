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
import { useToast } from "@/lib/toast-context";
import { computeConsumption } from "@/types/item"; // used for live preview only

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
  const preview =
    item && !isNaN(deltaNum) && deltaNum > 0 ? computeConsumption(item, deltaNum) : null;

  const handleSubmit = async () => {
    if (!item) return;
    const amount = parseFloat(delta);
    if (isNaN(amount) || amount <= 0) {
      setValidationError(t("consumeValidationError"));
      return;
    }
    // preview already holds the computation result; re-use it instead of recalculating
    if (!preview || preview.error) {
      setValidationError(preview?.error ?? t("consumeValidationError"));
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
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!item) {
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

  const currentDisplay =
    item.opened_remaining !== null && item.opened_remaining !== undefined
      ? t("openedDisplay", {
          remaining: item.opened_remaining,
          unit: item.content_unit,
          count: item.units > 0 ? item.units - 1 : 0,
        })
      : t("totalDisplaySealed", {
          units: item.units,
          amount: item.content_amount,
          unit: item.content_unit,
        });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
        <p className="mt-1 text-sm text-muted-foreground">
          {t("currentStock")}: {currentDisplay}
        </p>
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
          <p className="font-medium text-muted-foreground">{t("consumePreviewTitle")}</p>
          <p className="mt-1">
            {t("consumeUnitsDisplay", { units: preview.units_after })}
            {preview.opened_remaining_after !== null && preview.opened_remaining_after !== undefined
              ? t("consumeOpenedSuffix", {
                  remaining: preview.opened_remaining_after,
                  unit: item.content_unit,
                })
              : ""}
          </p>
        </div>
      )}
      {preview?.error && <p className="text-sm text-destructive">{preview.error}</p>}

      <Button
        className="w-full"
        onClick={() => {
          void handleSubmit();
        }}
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
