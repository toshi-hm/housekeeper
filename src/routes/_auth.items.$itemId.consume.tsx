import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsumeLot, useItemLots } from "@/hooks/useItemLots";
import { useItem } from "@/hooks/useItems";
import { useToast } from "@/lib/toast-context";
import { computeConsumption, type ItemLot } from "@/types/item";

const ItemConsumePage = () => {
  const { t } = useTranslation("items");
  const { itemId } = Route.useParams();
  const { lotId: preselectedLotId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: item, isLoading: itemLoading } = useItem(itemId);
  const { data: lots = [], isLoading: lotsLoading } = useItemLots(itemId);
  const consumeLot = useConsumeLot();
  const { toast } = useToast();
  const [selectedLotId, setSelectedLotId] = useState<string | null>(preselectedLotId ?? null);
  const [delta, setDelta] = useState("");
  const [validationError, setValidationError] = useState("");

  const isLoading = itemLoading || lotsLoading;

  const activeLots = lots.filter((l) => l.units > 0 || l.opened_remaining !== null);
  const hasMultipleLots = activeLots.length > 1;

  const selectedLot: ItemLot | null =
    selectedLotId != null
      ? (activeLots.find((l) => l.id === selectedLotId) ?? null)
      : activeLots.length === 1
        ? activeLots[0]!
        : null;

  const deltaNum = parseFloat(delta);
  const preview =
    item && selectedLot && !isNaN(deltaNum) && deltaNum > 0
      ? computeConsumption(
          {
            units: selectedLot.units,
            content_amount: item.content_amount,
            content_unit: item.content_unit,
            opened_remaining: selectedLot.opened_remaining ?? null,
          },
          deltaNum,
        )
      : null;

  const handleSubmit = async () => {
    if (!item || !selectedLot) return;
    const amount = parseFloat(delta);
    if (isNaN(amount) || amount <= 0) {
      setValidationError(t("consumeValidationError"));
      return;
    }
    if (!preview || preview.error) {
      setValidationError(preview?.error ?? t("consumeValidationError"));
      return;
    }
    try {
      await consumeLot.mutateAsync({ lot: selectedLot, item, deltaAmount: amount });
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
        <div className="space-y-3 rounded-lg border border-destructive p-4 text-destructive">
          <p className="font-medium">{t("itemNotFound")}</p>
          <p className="text-sm text-muted-foreground">{t("itemNotFoundDescription")}</p>
          <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
            {t("backToItems")}
          </Button>
        </div>
      </div>
    );
  }

  const currentDisplay = selectedLot
    ? selectedLot.opened_remaining !== null && selectedLot.opened_remaining !== undefined
      ? t("openedDisplay", {
          remaining: selectedLot.opened_remaining,
          unit: item.content_unit,
          count: selectedLot.units > 0 ? selectedLot.units - 1 : 0,
        })
      : t("totalDisplaySealed", {
          units: selectedLot.units,
          amount: item.content_amount,
          unit: item.content_unit,
        })
    : null;

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
        {currentDisplay && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("currentStock")}: {currentDisplay}
          </p>
        )}
      </div>

      {/* Lot selector (shown only when multiple active lots exist) */}
      {hasMultipleLots && (
        <div className="space-y-2">
          <Label>{t("selectLot")}</Label>
          <div className="space-y-2">
            {activeLots.map((lot, index) => {
              const lotDisplay =
                lot.opened_remaining !== null && lot.opened_remaining !== undefined
                  ? t("totalDisplayOpened", {
                      units: lot.units,
                      remaining: lot.opened_remaining,
                      unit: item.content_unit,
                    })
                  : t("totalDisplaySealed", {
                      units: lot.units,
                      amount: item.content_amount,
                      unit: item.content_unit,
                    });
              return (
                <button
                  key={lot.id}
                  type="button"
                  onClick={() => {
                    setSelectedLotId(lot.id);
                    setDelta("");
                    setValidationError("");
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedLotId === lot.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="text-sm font-medium">
                    {t("lotLabel", { index: index + 1 })} — {lotDisplay}
                  </p>
                  {lot.expiry_date && (
                    <p className="text-xs text-muted-foreground">
                      {t("expiryDate")}: {new Date(lot.expiry_date).toLocaleDateString()}
                    </p>
                  )}
                  {lot.purchase_date && (
                    <p className="text-xs text-muted-foreground">
                      {t("purchaseDate")}: {new Date(lot.purchase_date).toLocaleDateString()}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      {selectedLot && (
        <>
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
              autoFocus={!hasMultipleLots}
            />
            {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          </div>

          {/* Preview */}
          {preview && !preview.error && (
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium text-muted-foreground">{t("consumePreviewTitle")}</p>
              <p className="mt-1">
                {t("consumeUnitsDisplay", { units: preview.units_after })}
                {preview.opened_remaining_after !== null &&
                preview.opened_remaining_after !== undefined
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
            disabled={consumeLot.isPending || !delta || parseFloat(delta) <= 0}
          >
            {consumeLot.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {t("consume")}
          </Button>
        </>
      )}

      {hasMultipleLots && !selectedLot && (
        <p className="text-center text-sm text-muted-foreground">{t("selectLotHint")}</p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId/consume")({
  component: ItemConsumePage,
  validateSearch: (search: Record<string, unknown>) => ({
    lotId: typeof search.lotId === "string" ? search.lotId : undefined,
  }),
});
