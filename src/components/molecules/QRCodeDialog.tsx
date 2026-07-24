import QRCode from "qrcode";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useDialogA11y } from "@/hooks/useDialogA11y";

interface QRCodeDialogProps {
  value: string;
  title: string;
  onClose: () => void;
}

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const QRCodeCanvas = ({
  value,
  canvasRef,
}: {
  value: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) => {
  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, value, { width: 240, margin: 2 });
  }, [value, canvasRef]);

  return <canvas ref={canvasRef} />;
};

export const QRCodeDialog = ({ value, title, onClose }: QRCodeDialogProps) => {
  const { t } = useTranslation("items");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleId = useId();
  // このコンポーネントは親が条件付きマウント/アンマウントで開閉するため、
  // マウントされている間は常に open 扱いにする（#631）。
  const containerRef = useDialogA11y<HTMLDivElement>({ open: true, onClose });

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    const safeTitle = escapeHtml(title);
    const safeValue = escapeHtml(value);
    win.document.write(
      `<html><head><title>${safeTitle}</title><style>body{display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:24px}img{width:200px;height:200px}h2{margin:12px 0 4px}@media print{button{display:none}}</style></head>` +
        `<body><img src="${dataUrl}"><h2>${safeTitle}</h2><p style="color:#666;font-size:12px">${safeValue}</p>` +
        `<button onclick="window.print()">${t("qrPrint")}</button></body></html>`,
    );
    win.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-xs space-y-4 rounded-xl bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-center text-base font-semibold">
          {title}
        </h2>
        <div className="flex justify-center">
          <QRCodeCanvas value={value} canvasRef={canvasRef} />
        </div>
        <p className="break-all text-center text-xs text-muted-foreground">{value}</p>
        <div className="flex flex-col gap-2">
          <Button onClick={handlePrint} className="w-full">
            {t("qrPrint")}
          </Button>
          <Button variant="outline" onClick={onClose} className="w-full">
            {t("common:close")}
          </Button>
        </div>
      </div>
    </div>
  );
};
