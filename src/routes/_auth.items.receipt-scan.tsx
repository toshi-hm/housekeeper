import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ImageUploader } from "@/components/molecules/ImageUploader";
import { ReceiptReviewPanel } from "@/components/organisms/ReceiptReviewPanel";
import { Button } from "@/components/ui/button";
import { receiptScanErrorMessageKey, useReceiptScan } from "@/hooks/useReceiptScan";
import { useToast } from "@/lib/toast-context";
import { type ReceiptDraftItem, receiptLineItemToDraft } from "@/types/receipt";

type WizardStep =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "review"; drafts: ReceiptDraftItem[] }
  | { kind: "done"; succeeded: number };

/** 撮影/選択 → 解析中 → レビュー編集 → 完了、の3ステップを管理する新規ルート
 *  （receipt-scan.md「フロントエンド」節）。 */
const ReceiptScanPage = () => {
  const { t } = useTranslation("receiptScan");
  const { t: ti } = useTranslation("items");
  const navigate = useNavigate();
  const { toast } = useToast();
  const scanReceipt = useReceiptScan();
  const [step, setStep] = useState<WizardStep>({ kind: "idle" });

  const handleFile = async (file: File) => {
    setStep({ kind: "scanning" });
    try {
      const items = await scanReceipt.mutateAsync(file);
      if (items.length === 0) {
        toast(t("noItemsFound"), "warning");
      }
      setStep({ kind: "review", drafts: items.map(receiptLineItemToDraft) });
    } catch (err) {
      toast(t(receiptScanErrorMessageKey(err)), "error");
      setStep({ kind: "idle" });
    }
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

      {step.kind === "idle" && (
        <div className="space-y-3">
          <ImageUploader onFile={(file) => void handleFile(file)} />
          <p className="text-xs text-muted-foreground">{t("idleHint")}</p>
        </div>
      )}

      {step.kind === "scanning" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Spinner className="h-8 w-8" />
          <p>{t("scanning")}</p>
        </div>
      )}

      {step.kind === "review" && (
        <ReceiptReviewPanel
          drafts={step.drafts}
          onDraftsChange={(drafts) => setStep({ kind: "review", drafts })}
          onDone={({ succeeded }) => setStep({ kind: "done", succeeded })}
        />
      )}

      {step.kind === "done" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-lg font-medium">{t("doneTitle", { count: step.succeeded })}</p>
          <Button onClick={() => void navigate({ to: "/" })}>{t("backToList")}</Button>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/receipt-scan")({
  component: ReceiptScanPage,
});
