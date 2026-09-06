import { Camera, Image as ImageIcon, SwitchCamera, X } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface ShelfScanCameraProps {
  /** 撮影 or ライブラリ選択で得られた1枚の画像ファイル。 */
  onCapture: (file: File) => void;
  onClose: () => void;
}

const CAPTURE_MIME_TYPE = "image/jpeg";
const CAPTURE_QUALITY = 0.92;

/**
 * 保管場所/カテゴリ選択後の撮影ステップ。`BarcodeScanner`（`src/components/
 * organisms/BarcodeScanner.tsx`）と同じフルスクリーンモーダル・カメラ列挙・
 * 前面/背面切替・エラー時リトライのパターンを踏襲するが、連続バーコード
 * デコード（zxing）ではなく1枚のスナップショット撮影が目的のため、
 * `navigator.mediaDevices.getUserMedia` を直接使う（shelf-scan.md「画面」節）。
 * カメラが使えない環境向けに、常に「ライブラリから選択」導線（既存の
 * ImageUploaderと同じ `capture="environment"` 付きファイル入力）を用意する。
 */
export const ShelfScanCamera = ({ onCapture, onClose }: ShelfScanCameraProps) => {
  const { t } = useTranslation("shelfScan");
  const { t: tCommon } = useTranslation("common");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startCamera = useCallback(
    async (deviceId?: string) => {
      stopStream();
      setError(null);
      setIsStarting(true);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("cameraUnsupported"));
        setIsStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
        });
        if (!isMountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // 一部環境ではplay()が例外を投げることがあるが、autoplay属性なしの
            // <video>でもストリームは表示されるため致命的ではない。
          }
        }
        setIsStarting(false);
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : t("cameraAccessDenied"));
        setIsStarting(false);
      }
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;

    const init = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        if (!cancelled) {
          setError(t("cameraUnsupported"));
          setIsStarting(false);
        }
        return;
      }
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoInputDevices = allDevices.filter((d) => d.kind === "videoinput");
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
        await startCamera(rearIdx >= 0 ? videoInputDevices[rearIdx]?.deviceId : undefined);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("cameraAccessDenied"));
          setIsStarting(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      stopStream();
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

  const handleShutter = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    if (canvas.width === 0 || canvas.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setIsCapturing(true);
    canvas.toBlob(
      (blob) => {
        setIsCapturing(false);
        if (!blob) return;
        onCapture(new File([blob], "shelf-scan.jpg", { type: CAPTURE_MIME_TYPE }));
      },
      CAPTURE_MIME_TYPE,
      CAPTURE_QUALITY,
    );
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onCapture(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black lg:items-center lg:justify-center lg:bg-black/70">
      <div className="flex h-full flex-col bg-black lg:h-[580px] lg:w-[480px] lg:overflow-hidden lg:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2 text-white">
            <Camera className="h-5 w-5" />
            <span className="font-medium">{t("cameraTitle")}</span>
          </div>
          <div className="flex items-center gap-2">
            {devices.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSwitchCamera}
                className="text-white hover:bg-white/20"
                title={t("switchCamera")}
                aria-label={t("switchCamera")}
              >
                <SwitchCamera className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="text-white hover:bg-white/20"
              title={t("pickFromLibrary")}
              aria-label={t("pickFromLibrary")}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
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

        {/* Camera / error area */}
        <div className="relative flex-1">
          <video
            ref={videoRef}
            className={`h-full w-full object-cover ${error ? "opacity-0" : ""}`}
            muted
            playsInline
          />
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white">
              <div>
                <p className="text-lg font-medium">{t("cameraError")}</p>
                <p className="mt-2 text-sm text-white/70">{error}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <Button onClick={handleRetry} variant="outline">
                    {tCommon("retry")}
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                    {t("pickFromLibrary")}
                  </Button>
                  <Button onClick={onClose} variant="ghost" className="text-white">
                    {tCommon("cancel")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-white">{t("cameraStarting")}</span>
                </div>
              )}
              {/* Framing overlay guide */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-56 w-72">
                  <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white" />
                  <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white" />
                  <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white" />
                  <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white" />
                </div>
              </div>
            </>
          )}
        </div>

        {!error && (
          <div className="flex flex-col items-center gap-2 p-4">
            <Button
              size="icon"
              className="h-16 w-16 rounded-full"
              disabled={isStarting || isCapturing}
              onClick={handleShutter}
              aria-label={t("shutter")}
            >
              <Camera className="h-6 w-6" />
            </Button>
            <p className="text-center text-sm text-white/70">{t("cameraHint")}</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>
    </div>
  );
};
