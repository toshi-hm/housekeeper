import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { Camera, Keyboard, SwitchCamera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const { t } = useTranslation("items");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);

  const startScanning = useCallback(
    async (deviceId?: string) => {
      controlsRef.current?.stop();
      setError(null);
      setIsStarting(true);
      try {
        const reader = new BrowserMultiFormatReader();
        if (!videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, err) => {
            if (result) {
              onScan(result.getText());
            }
            if (err && !(err instanceof NotFoundException)) {
              // ignore NotFoundException (no barcode in frame yet)
            }
          },
        );
        controlsRef.current = controls;
        setIsStarting(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Camera access denied");
        setIsStarting(false);
      }
    },
    [onScan],
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

        // ラベルで背面カメラが特定できない場合は deviceId=undefined で渡す。
        // zxing は deviceId が undefined のとき facingMode:"environment" を使うため
        // 背面カメラが自動選択される。
        const deviceId = rearIdx >= 0 ? videoInputDevices[rearIdx]?.deviceId : undefined;
        await startScanning(deviceId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Camera access denied");
          setIsStarting(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [startScanning]);

  const handleSwitchCamera = () => {
    if (devices.length <= 1) return;
    const nextIndex = (deviceIndex + 1) % devices.length;
    setDeviceIndex(nextIndex);
    void startScanning(devices[nextIndex]?.deviceId);
  };

  const handleRetry = () => {
    void startScanning(devices[deviceIndex]?.deviceId);
  };

  const handleManualSubmit = () => {
    const code = manualValue.trim();
    if (code) onScan(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black lg:items-center lg:justify-center lg:bg-black/70">
      <div className="flex h-full flex-col bg-black lg:h-[580px] lg:w-[480px] lg:overflow-hidden lg:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2 text-white">
            <Camera className="h-5 w-5" />
            <span className="font-medium">{t("scanBarcode")}</span>
          </div>
          <div className="flex items-center gap-2">
            {devices.length > 1 && (
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowManual((v) => !v)}
              className="text-white hover:bg-white/20"
              title={t("scannerManualInput")}
            >
              <Keyboard className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Camera / error area */}
        <div className="relative flex-1">
          {error ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-white">
              <div>
                <p className="text-lg font-medium">{t("scannerError")}</p>
                <p className="mt-2 text-sm text-white/70">{error}</p>
                <div className="mt-4 flex justify-center gap-3">
                  <Button onClick={handleRetry} variant="outline">
                    {t("scannerRetry")}
                  </Button>
                  <Button onClick={onClose} variant="ghost" className="text-white">
                    {t("common:cancel")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-white">{t("scannerStarting")}</span>
                </div>
              )}
              {/* Scanning frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-48 w-72">
                  <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white" />
                  <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white" />
                  <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white" />
                  <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Manual input fallback */}
        {showManual && (
          <div className="bg-black/80 p-4">
            <p className="mb-2 text-sm text-white/70">{t("scannerManualInput")}</p>
            <div className="flex gap-2">
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder={t("scannerManualPlaceholder")}
                className="bg-white/10 text-white placeholder:text-white/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualSubmit();
                }}
                autoFocus
              />
              <Button onClick={handleManualSubmit} disabled={!manualValue.trim()}>
                {t("common:confirm")}
              </Button>
            </div>
          </div>
        )}

        {!showManual && !error && (
          <div className="p-4 text-center text-sm text-white/70">{t("scannerHint")}</div>
        )}
      </div>
    </div>
  );
};
