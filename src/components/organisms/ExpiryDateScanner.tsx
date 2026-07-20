import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, Check, Keyboard, Loader2, RotateCcw, SwitchCamera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Worker as TesseractWorker } from "tesseract.js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseExpiryDateFromOcrText } from "@/lib/expiryDateOcr";

interface ExpiryDateScannerProps {
  /** ユーザーが確定ボタンを押したときにのみ呼ばれる（自動確定はしない） */
  onConfirm: (isoDate: string) => void;
  onClose: () => void;
}

type Stage = "camera" | "processing" | "result";

/** OCRの日本語文字は "eng" 言語モデルでは認識できないため、数字と区切り文字のみに限定して精度を上げる */
const OCR_CHAR_WHITELIST = "0123456789./-年月日";

export const ExpiryDateScanner = ({ onConfirm, onClose }: ExpiryDateScannerProps) => {
  const { t } = useTranslation("items");
  const { t: tCommon } = useTranslation("common");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [candidateDate, setCandidateDate] = useState("");
  const [notFound, setNotFound] = useState(false);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      controlsRef.current?.stop();
      setError(null);
      setIsStarting(true);
      try {
        const reader = new BrowserMultiFormatReader();
        if (!videoRef.current) {
          setIsStarting(false);
          return;
        }
        // BarcodeScanner と同じ zxing のカメラ取得パターンを流用する（バーコードデコード結果は使わない）
        const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, () => {
          // OCRでは連続デコードは不要なため結果・エラーともに無視する
        });
        controlsRef.current = controls;
        setIsStarting(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("scannerCameraAccessDenied"));
        setIsStarting(false);
      }
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(videoInputDevices);

        const rearIdx = videoInputDevices.findIndex((d) => {
          const label = d.label.toLowerCase();
          return (
            label.includes("back") ||
            label.includes("rear") ||
            label.includes("environment") ||
            label.includes("背面")
          );
        });
        const idx = rearIdx >= 0 ? rearIdx : 0;
        setDeviceIndex(idx);
        const deviceId = rearIdx >= 0 ? videoInputDevices[rearIdx]?.deviceId : undefined;
        await startCamera(deviceId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("scannerCameraAccessDenied"));
          setIsStarting(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [startCamera, t]);

  const handleSwitchCamera = () => {
    if (devices.length <= 1) return;
    const nextIndex = (deviceIndex + 1) % devices.length;
    setDeviceIndex(nextIndex);
    void startCamera(devices[nextIndex]?.deviceId);
  };

  const handleRetry = () => {
    void startCamera(devices[deviceIndex]?.deviceId);
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    controlsRef.current?.stop();
    setStage("processing");
    setNotFound(false);

    let worker: TesseractWorker | null = null;
    try {
      // tesseract.js はサイズが大きいため、実際に撮影したタイミングで遅延ロードする
      // （ItemForm / ExpiryDateScanner 自体のバンドルには含めない）
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng");
      await worker.setParameters({ tessedit_char_whitelist: OCR_CHAR_WHITELIST });
      const result = await worker.recognize(canvas);
      const text = result.data.text ?? "";
      const parsed = parseExpiryDateFromOcrText(text);
      setCandidateDate(parsed ?? "");
      setNotFound(parsed === null);
    } catch {
      setCandidateDate("");
      setNotFound(true);
    } finally {
      await worker?.terminate();
      setStage("result");
    }
  };

  const handleRetake = () => {
    setStage("camera");
    setCandidateDate("");
    setNotFound(false);
    void startCamera(devices[deviceIndex]?.deviceId);
  };

  const handleConfirm = () => {
    if (!candidateDate) return;
    onConfirm(candidateDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black lg:items-center lg:justify-center lg:bg-black/70">
      <div className="flex h-full flex-col bg-black lg:h-[620px] lg:w-[480px] lg:overflow-hidden lg:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2 text-white">
            <Camera className="h-5 w-5" />
            <span className="font-medium">{t("expiryScanTitle")}</span>
          </div>
          <div className="flex items-center gap-2">
            {stage === "camera" && devices.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSwitchCamera}
                className="text-white hover:bg-white/20"
                title={t("scannerSwitchCamera")}
              >
                <SwitchCamera className="h-5 w-5" />
              </Button>
            )}
            {stage === "camera" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowManual((v) => !v)}
                className="text-white hover:bg-white/20"
                title={t("scannerManualInput")}
              >
                <Keyboard className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
              aria-label={tCommon("close")}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Camera / result area */}
        <div className="relative flex-1">
          <video
            ref={videoRef}
            className={`h-full w-full object-cover ${
              error || stage !== "camera" ? "opacity-0" : ""
            }`}
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />

          {error && stage === "camera" ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white">
              <div>
                <p className="text-lg font-medium">{t("scannerError")}</p>
                <p className="mt-2 text-sm text-white/70">{error}</p>
                <div className="mt-4 flex justify-center gap-3">
                  <Button onClick={handleRetry} variant="outline">
                    {t("scannerRetry")}
                  </Button>
                  <Button
                    onClick={() => setShowManual(true)}
                    variant="outline"
                    className="text-black"
                  >
                    {t("scannerManualInput")}
                  </Button>
                  <Button onClick={onClose} variant="ghost" className="text-white">
                    {t("common:cancel")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {stage === "camera" && !showManual && (
                <>
                  {isStarting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span className="text-white">{t("scannerStarting")}</span>
                    </div>
                  )}
                  {/* Capture frame overlay guiding the user to frame the printed date */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative h-24 w-64">
                      <div className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-white" />
                      <div className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-white" />
                      <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-white" />
                      <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-white" />
                    </div>
                  </div>
                </>
              )}

              {stage === "processing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span>{t("expiryScanProcessing")}</span>
                </div>
              )}

              {stage === "result" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-white">
                  <p className="text-sm text-white/70">
                    {notFound ? t("expiryScanNotFound") : t("expiryScanFoundHint")}
                  </p>
                  <div className="w-full max-w-xs space-y-2">
                    <Label htmlFor="expiry-scan-candidate" className="text-white">
                      {t("expiryDate")}
                    </Label>
                    <Input
                      id="expiry-scan-candidate"
                      type="date"
                      value={candidateDate}
                      onChange={(e) => setCandidateDate(e.target.value)}
                      className="bg-white text-black"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button type="button" onClick={handleRetake} variant="outline">
                      <RotateCcw className="mr-1 h-4 w-4" />
                      {t("expiryScanRetake")}
                    </Button>
                    <Button type="button" onClick={handleConfirm} disabled={!candidateDate}>
                      <Check className="mr-1 h-4 w-4" />
                      {t("expiryScanConfirm")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Manual input fallback (camera bypass) */}
        {stage === "camera" && showManual && (
          <div className="bg-black/80 p-4">
            <p className="mb-2 text-sm text-white/70">{t("expiryScanManualHint")}</p>
            <div className="flex gap-2">
              <Input
                type="date"
                value={candidateDate}
                onChange={(e) => setCandidateDate(e.target.value)}
                className="bg-white/10 text-white [color-scheme:dark]"
                autoFocus
              />
              <Button onClick={handleConfirm} disabled={!candidateDate}>
                {t("common:confirm")}
              </Button>
            </div>
          </div>
        )}

        {stage === "camera" && !showManual && !error && (
          <div className="p-4 text-center text-sm text-white/70">
            <p>{t("expiryScanHint")}</p>
            <Button type="button" onClick={() => void handleCapture()} className="mt-3 w-full">
              <Camera className="mr-2 h-4 w-4" />
              {t("expiryScanCapture")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
