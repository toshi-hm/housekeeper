import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { TotpCodeInput } from "@/components/molecules/TotpCodeInput";
import { TotpQrCode } from "@/components/molecules/TotpQrCode";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type TotpEnrollment,
  useEnrollTotp,
  useMfaFactors,
  useUnenrollTotp,
  useVerifyTotpEnrollment,
} from "@/hooks/useMfa";
import { hasVerifiedTotpFactor, totpCodeSchema, translateMfaError } from "@/lib/mfa";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";

export const SecuritySettings = () => {
  const { t } = useTranslation("mfa");
  const { toast } = useToast();
  const { data: factors, isLoading } = useMfaFactors();
  const enrollTotp = useEnrollTotp();
  const verifyEnrollment = useVerifyTotpEnrollment();
  const unenrollTotp = useUnenrollTotp();

  const [step, setStep] = useState<"idle" | "enrolling">("idle");
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const enabled = hasVerifiedTotpFactor(factors ?? []);
  const verifiedFactor = (factors ?? []).find((f) => f.status === "verified") ?? null;

  const handleEnable = async () => {
    try {
      const result = await enrollTotp.mutateAsync();
      setEnrollment(result);
      setCode("");
      setCodeError(null);
      setStep("enrolling");
    } catch (err) {
      toast(err instanceof OfflineError ? t("common:offlineError") : t("enrollFailed"), "error");
    }
  };

  const handleVerify = async () => {
    const result = totpCodeSchema.safeParse(code);
    if (!result.success) {
      setCodeError(result.error.issues[0]?.message ?? t("codeInvalid"));
      return;
    }
    if (!enrollment) return;

    try {
      await verifyEnrollment.mutateAsync({ factorId: enrollment.factorId, code: result.data });
      toast(t("enrollSuccess"), "success");
      setStep("idle");
      setEnrollment(null);
      setCode("");
      setCodeError(null);
    } catch (err) {
      if (err instanceof OfflineError) {
        toast(t("common:offlineError"), "error");
        return;
      }
      setCodeError(translateMfaError(err instanceof Error ? err.message : t("verifyFailed")));
    }
  };

  const handleCancelEnrollment = async () => {
    const factorId = enrollment?.factorId;
    setStep("idle");
    setEnrollment(null);
    setCode("");
    setCodeError(null);
    if (!factorId) return;
    try {
      await unenrollTotp.mutateAsync(factorId);
    } catch {
      // ベストエフォートの後始末。未検証factorが残っても再設定は妨げられない
    }
  };

  const handleDisableConfirm = async () => {
    if (!verifiedFactor) return;
    try {
      await unenrollTotp.mutateAsync(verifiedFactor.id);
      toast(t("disableSuccess"), "success");
      setConfirmOpen(false);
    } catch (err) {
      toast(err instanceof OfflineError ? t("common:offlineError") : t("unenrollFailed"), "error");
    }
  };

  return (
    <div className="space-y-3">
      {step === "idle" ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t("title")}</span>
            </div>
            <Button
              variant={enabled ? "outline" : "default"}
              size="sm"
              disabled={isLoading || enrollTotp.isPending}
              onClick={() => {
                if (enabled) {
                  setConfirmOpen(true);
                } else {
                  void handleEnable();
                }
              }}
            >
              {enrollTotp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {enabled ? t("disableButton") : t("enableButton")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {enabled ? t("enabledHelp") : t("disabledHelp")}
          </p>
        </div>
      ) : (
        enrollment && (
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <h3 className="font-medium">{t("setupTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("setupInstructions")}</p>
            </div>

            <TotpQrCode uri={enrollment.qrCodeUri} label={t("qrCodeAlt")} />

            <div className="space-y-1 text-center">
              <p className="text-xs text-muted-foreground">{t("manualEntryLabel")}</p>
              <p className="break-all rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
                {enrollment.secret}
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="mfaEnrollCode">{t("codeLabel")}</Label>
              <TotpCodeInput id="mfaEnrollCode" value={code} onChange={setCode} autoFocus />
              {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  void handleVerify();
                }}
                disabled={verifyEnrollment.isPending}
              >
                {verifyEnrollment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("verifyButton")}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  void handleCancelEnrollment();
                }}
                disabled={verifyEnrollment.isPending}
              >
                {t("cancelSetup")}
              </Button>
            </div>
          </div>
        )
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t("disableConfirmTitle")}
        message={t("disableConfirmMessage")}
        confirmLabel={t("disableButton")}
        isConfirming={unenrollTotp.isPending}
        onConfirm={() => {
          void handleDisableConfirm();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
