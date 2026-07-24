import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConsumeLot, useItemLots } from "@/hooks/useItemLots";
import { useItem } from "@/hooks/useItems";
import { parseLocalDate } from "@/lib/dateUtils";
import { useToast } from "@/lib/toast-context";
import { convertUnit, getConvertibleUnits } from "@/lib/units";
import {
  computeConsumption,
  CONSUME_REASONS,
  type ConsumeReason,
  type ConsumptionError,
  getLotRemainingAmount,
  type ItemLot,
  roundFloat,
} from "@/types/item";

const consumptionErrorKey = {
  insufficientStock: "insufficientStock",
} as const satisfies Record<ConsumptionError, string>;

// Dynamic i18n key lookup for consumption reason chips — see CLAUDE.md's
// "i18n キーの動的参照ルール" (Key Map instead of template-literal concatenation
// so i18next-parser's static-literal extraction still covers every key, and
// TS enforces exhaustiveness against ConsumeReason).
const consumeReasonLabelKey = {
  cooking: "consumeReasonCooking",
  expired: "consumeReasonExpired",
  gift: "consumeReasonGift",
  other: "consumeReasonOther",
} as const satisfies Record<ConsumeReason, string>;

export const ItemConsumePage = () => {
  const { t, i18n } = useTranslation("items");
  const { itemId } = Route.useParams();
  const { lotId: preselectedLotId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: item, isLoading: itemLoading } = useItem(itemId);
  const { data: lots = [], isLoading: lotsLoading, isError: lotsError } = useItemLots(itemId);
  const consumeLot = useConsumeLot();
  const { toast } = useToast();
  const [selectedLotId, setSelectedLotId] = useState<string | null>(preselectedLotId ?? null);
  const [delta, setDelta] = useState("");
  // 消費量の入力単位。デフォルトは item.content_unit だが、同一系統（mL↔L、g↔kg）
  // の単位であれば切り替えて入力できる（issue #462）。内部の保持単位・消費アルゴリズム
  // (computeConsumption / item.content_unit) は変えず、送信直前に content_unit へ換算する。
  // 別アイテムに遷移した（itemId が変わった）タイミングでのみ追従させたいので、
  // useEffect ではなく「レンダー中に前回値と比較して補正する」React 公式パターンを使う
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)。
  // 同期のキーには item.content_unit ではなく itemId を使う: TanStack Router はパスパラメータ
  // だけが変わってもこのコンポーネントを再マウントしないため、content_unit の値で比較すると
  // 「新しい content_unit がたまたま前のアイテムと同じ文字列」のケースで deltaUnit が
  // 前アイテムの選択のまま残ってしまう。
  const [deltaUnit, setDeltaUnit] = useState("");
  const [syncedItemId, setSyncedItemId] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState("");
  const [showConsumeAll, setShowConsumeAll] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [selectedReason, setSelectedReason] = useState<ConsumeReason | null>(null);

  // Combine the preset reason chip (if any) with the free-text memo into a
  // single note stored on consumption_logs.note. Kept as separate state
  // instead of writing the chip label directly into the textarea so that
  // switching/deselecting a reason never clobbers text the user already
  // typed (#418).
  const buildNote = (): string | null => {
    const reasonLabel = selectedReason ? t(consumeReasonLabelKey[selectedReason]) : null;
    const trimmed = noteText.trim();
    if (reasonLabel && trimmed) return `${reasonLabel}: ${trimmed}`;
    return reasonLabel ?? (trimmed || null);
  };

  const isLoading = itemLoading || lotsLoading;

  if (item?.content_unit && itemId !== syncedItemId) {
    setSyncedItemId(itemId);
    setDeltaUnit(item.content_unit);
  }

  const contentAmount = item?.content_amount ?? 0;
  const getLotTotal = (l: ItemLot): number =>
    getLotRemainingAmount(l.units, contentAmount, l.opened_remaining ?? null);
  const activeLots = lots.filter((l) => getLotTotal(l) > 0);
  const hasMultipleLots = activeLots.length > 1;
  const convertibleUnits = item ? getConvertibleUnits(item.content_unit) : [];
  const canConvertUnit = convertibleUnits.length > 1;

  // A `lotId` carried over from a stale link (browser back/forward, another
  // tab/device consuming the last of that lot concurrently, etc.) may no
  // longer exist among the active lots. Treat that the same as "no lot
  // selected" instead of leaving selectedLot permanently null when exactly
  // one active lot remains — otherwise the form renders blank with no way
  // to consume the only remaining lot (#485).
  const requestedLot =
    selectedLotId !== null ? (activeLots.find((l) => l.id === selectedLotId) ?? null) : null;
  const selectedLot: ItemLot | null =
    requestedLot ?? (activeLots.length === 1 ? activeLots[0]! : null);

  const deltaNum = parseFloat(delta);
  // ユーザーが item.content_unit と異なる（が換算可能な）単位を選んでいる場合は
  // item.content_unit 換算後の量で在庫計算する。換算できない組み合わせは起こり得ない
  // 想定だが（deltaUnit は convertibleUnits から選ばれる）、保険として入力値へフォールバックする。
  const convertedDeltaNum =
    item && !isNaN(deltaNum) && deltaNum > 0
      ? (convertUnit(deltaNum, deltaUnit, item.content_unit) ?? deltaNum)
      : deltaNum;
  const isConverting = item !== undefined && deltaUnit !== item.content_unit;
  const preview =
    item && selectedLot && !isNaN(convertedDeltaNum) && convertedDeltaNum > 0
      ? computeConsumption(
          {
            units: selectedLot.units,
            content_amount: item.content_amount,
            content_unit: item.content_unit,
            opened_remaining: selectedLot.opened_remaining ?? null,
          },
          convertedDeltaNum,
        )
      : null;

  const handleSubmit = async () => {
    if (!item || !selectedLot) return;
    const amount = convertedDeltaNum;
    if (isNaN(amount) || amount <= 0) {
      setValidationError(t("consumeValidationError"));
      return;
    }
    if (!preview || preview.error) {
      setValidationError(
        preview?.error ? t(consumptionErrorKey[preview.error]) : t("consumeValidationError"),
      );
      return;
    }
    try {
      await consumeLot.mutateAsync({
        lot: selectedLot,
        item,
        deltaAmount: amount,
        note: buildNote(),
      });
      toast(t("consumeSuccess"), "success");
      void navigate({ to: "/items/$itemId", params: { itemId } });
    } catch {
      // Error toast is handled by useConsumeLot.onError
    }
  };

  const handleConsumeAll = async (totalAmount: number) => {
    if (!item || !selectedLot) return;
    try {
      await consumeLot.mutateAsync({
        lot: selectedLot,
        item,
        deltaAmount: totalAmount,
        note: buildNote(),
      });
      setShowConsumeAll(false);
      toast(t("consumeSuccess"), "success");
      void navigate({ to: "/items/$itemId", params: { itemId } });
    } catch {
      setShowConsumeAll(false);
      // Error toast is handled by useConsumeLot.onError
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (lotsError) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void navigate({ to: "/items/$itemId", params: { itemId } })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-3 rounded-lg border border-destructive p-4 text-destructive">
          <p className="font-medium">{t("lotsLoadError")}</p>
          <Button
            variant="outline"
            onClick={() => void navigate({ to: "/items/$itemId", params: { itemId } })}
          >
            {t("back")}
          </Button>
        </div>
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

  const totalLotAmount = selectedLot ? roundFloat(getLotTotal(selectedLot)) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {showConsumeAll && (
        <ConfirmDialog
          open={showConsumeAll}
          title={t("consumeAllTitle")}
          message={t("consumeAllConfirm", {
            amount: totalLotAmount,
            unit: item.content_unit,
          })}
          confirmLabel={t("consumeAllConfirmLabel")}
          isConfirming={consumeLot.isPending}
          onConfirm={() => {
            void handleConsumeAll(totalLotAmount);
          }}
          onCancel={() => setShowConsumeAll(false)}
        />
      )}
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
          <Label id="lot-selector-label">{t("selectLot")}</Label>
          <div role="radiogroup" aria-labelledby="lot-selector-label" className="space-y-2">
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
                  role="radio"
                  aria-checked={selectedLotId === lot.id}
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
                      {t("expiryDate")}:{" "}
                      {parseLocalDate(lot.expiry_date).toLocaleDateString(i18n.language)}
                    </p>
                  )}
                  {lot.purchase_date && (
                    <p className="text-xs text-muted-foreground">
                      {t("purchaseDate")}:{" "}
                      {parseLocalDate(lot.purchase_date).toLocaleDateString(i18n.language)}
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
              {t("consumeAmount")}
              {!canConvertUnit ? ` (${item.content_unit})` : ""}
            </Label>
            <div className="flex gap-2">
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
                className="flex-1"
              />
              {canConvertUnit && (
                <Select
                  aria-label={t("consumeUnit")}
                  value={deltaUnit}
                  onChange={(e) => setDeltaUnit(e.target.value)}
                  className="w-24 shrink-0"
                >
                  {convertibleUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {isConverting && !isNaN(deltaNum) && deltaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("consumeConvertedHint", {
                  amount: convertedDeltaNum,
                  unit: item.content_unit,
                })}
              </p>
            )}
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
          {preview?.error && (
            <p className="text-sm text-destructive">{t(consumptionErrorKey[preview.error])}</p>
          )}

          {/* Preset consumption-reason chips (optional) — combined with the
              free-text note below when the log is saved (#418). */}
          <div className="space-y-2">
            <Label id="consume-reason-label">{t("consumeReason")}</Label>
            <div
              role="group"
              aria-labelledby="consume-reason-label"
              className="flex flex-wrap gap-2"
            >
              {CONSUME_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={selectedReason === reason}
                  onClick={() => setSelectedReason((prev) => (prev === reason ? null : reason))}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    selectedReason === reason
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {t(consumeReasonLabelKey[reason])}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="consume-note">{t("consumeNote")}</Label>
            <Textarea
              id="consume-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t("consumeNotePlaceholder")}
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowConsumeAll(true)}
              disabled={consumeLot.isPending || totalLotAmount <= 0}
            >
              {t("consumeAll", { amount: totalLotAmount, unit: item.content_unit })}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={
                consumeLot.isPending ||
                !delta.trim() ||
                isNaN(parseFloat(delta)) ||
                parseFloat(delta) <= 0
              }
            >
              {consumeLot.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t("consume")}
            </Button>
          </div>
        </>
      )}

      {activeLots.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">{t("noStockToConsume")}</p>
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
