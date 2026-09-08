import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ShelfScanCamera } from "@/components/organisms/ShelfScanCamera";
import { ShelfScanReviewPanel } from "@/components/organisms/ShelfScanReviewPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { fetchItems } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { ShelfScanError, shelfScanErrorMessageKey, useShelfScan } from "@/hooks/useShelfScan";
import { matchShelfScanCandidates, type ShelfScanMatchResult } from "@/lib/shelfScanMatch";
import { useToast } from "@/lib/toast-context";

type CaptureStep =
  | { kind: "selecting" }
  | { kind: "camera" }
  | { kind: "scanning" }
  | { kind: "review"; matches: ShelfScanMatchResult };

/** 保管場所/カテゴリ選択 → 撮影 → 解析中 → 差分レビュー、の4ステップを管理する
 *  新規ルート（shelf-scan.md「画面」節、`ReceiptScanPage`と同様の構成）。 */
export const ShelfScanCapturePage = () => {
  const { t } = useTranslation("shelfScan");
  const { t: ti } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { toast } = useToast();
  const scanShelf = useShelfScan();
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();

  const categoryFieldId = useId();
  const locationFieldId = useId();

  const [categoryId, setCategoryId] = useState("");
  const [storageLocationId, setStorageLocationId] = useState("");
  const [step, setStep] = useState<CaptureStep>({ kind: "selecting" });
  // receipt-scanの#923対応と同じく、Edge Functionの待ち時間中にキャンセルできる
  // よう、進行中リクエストをAbortControllerで識別する。
  const activeScanRef = useRef<AbortController | null>(null);

  // shelf-scan.md「やらないこと」節: カテゴリ・保管場所をまたいだ全在庫の突き合わせ
  // はしない。撮影前にどちらか一方は必ず選択させる。
  const canStartCapture = categoryId !== "" || storageLocationId !== "";

  const handleCapture = async (file: File) => {
    const controller = new AbortController();
    activeScanRef.current = controller;
    setStep({ kind: "scanning" });
    try {
      const [{ items: candidateNames }, existingItems] = await Promise.all([
        scanShelf.mutateAsync({ file, signal: controller.signal }),
        fetchItems({
          categoryId: categoryId || undefined,
          storageLocationId: storageLocationId || undefined,
        }),
      ]);
      if (activeScanRef.current !== controller) return; // キャンセル済み/古いリクエスト

      // shelf-scan.md「スコープ」節: マッチング対象は在庫が残っている
      // (units > 0) アクティブなアイテムのみ（fetchItemsはdeleted_atのみ絞り込み済み）。
      const activeItems = existingItems
        .filter((item) => item.units > 0)
        .map((item) => ({ id: item.id, name: item.name }));
      const matches = matchShelfScanCandidates(candidateNames, activeItems);

      if (candidateNames.length === 0) {
        toast(t("noCandidatesFound"), "warning");
      }
      setStep({ kind: "review", matches });
    } catch (err) {
      if (activeScanRef.current !== controller) return; // キャンセル済み: 画面は既に戻している
      if (err instanceof ShelfScanError && err.kind === "cancelled") return;
      toast(t(shelfScanErrorMessageKey(err)), "error");
      setStep({ kind: "selecting" });
    }
  };

  const handleCancelScan = () => {
    activeScanRef.current?.abort();
    activeScanRef.current = null;
    setStep({ kind: "selecting" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void navigate({ to: "/" })}
          aria-label={ti("back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {step.kind === "selecting" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor={categoryFieldId}>{ti("category")}</Label>
            <Select
              id={categoryFieldId}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={locationFieldId}>{ti("storageLocation")}</Label>
            <Select
              id={locationFieldId}
              value={storageLocationId}
              onChange={(e) => setStorageLocationId(e.target.value)}
            >
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{t("selectionHint")}</p>
          <Button
            className="w-full"
            disabled={!canStartCapture}
            onClick={() => setStep({ kind: "camera" })}
          >
            <Camera className="mr-1 h-4 w-4" />
            {t("startCapture")}
          </Button>
        </div>
      )}

      {step.kind === "camera" && (
        <ShelfScanCamera
          onCapture={(file) => void handleCapture(file)}
          onClose={() => setStep({ kind: "selecting" })}
        />
      )}

      {step.kind === "scanning" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Spinner className="h-8 w-8" />
          <p>{t("scanning")}</p>
          <Button variant="outline" size="sm" onClick={handleCancelScan}>
            {tc("cancel")}
          </Button>
        </div>
      )}

      {step.kind === "review" && (
        <ShelfScanReviewPanel
          possiblyConsumed={step.matches.possiblyConsumed}
          possiblyUnregistered={step.matches.possiblyUnregistered}
        />
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/shelf-scan")({
  component: ShelfScanCapturePage,
});
